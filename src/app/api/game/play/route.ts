import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  validateSelection,
  drawKenoNumbers,
  countMatches,
  matchedNumbers,
  DRAW_ALGORITHM_VERSION,
  KENO_POOL_SIZE,
  KENO_DRAW_SIZE,
  KENO_MAX_SPOTS,
} from "@/lib/keno/engine";
import {
  calculatePayout,
  getMultiplier,
  PAYTABLE_VERSION,
} from "@/lib/keno/paytable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PLAYER_NAME = "guest";
const MIN_STAKE_MINOR = 100; // 1.00
const MAX_STAKE_MINOR = 100000; // 1000.00
const STARTING_BALANCE = 100000; // 1000.00 in minor units (cents)

interface PlayRequestBody {
  selectedNumbers?: number[];
  stakeMinor?: number;
  idempotencyKey?: string;
  playerName?: string;
}

/**
 * POST /api/game/play
 *
 * Submit a ticket, draw 20 unique numbers, and settle atomically.
 *
 * The full server-authoritative state-machine flow runs inside one Prisma
 * transaction:
 *   1. Get-or-create the player (auto-provisioned guest).
 *   2. Validate the selection and stake.
 *   3. Reject if the idempotencyKey was already used (return cached result).
 *   4. Reject if balance < stake.
 *   5. OPEN round -> create ticket -> debit stake.
 *   6. CLOSED round.
 *   7. DRAWN round -> persist immutable draw result.
 *   8. Calculate matches and payout.
 *   9. SETTLED round -> create ticket_result -> credit payout.
 *
 * The browser NEVER decides the winning numbers or the payout.
 */
export async function POST(req: NextRequest) {
  let body: PlayRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const selectedNumbers = Array.isArray(body.selectedNumbers)
    ? body.selectedNumbers
    : [];
  const stakeMinor = Number(body.stakeMinor);
  const idempotencyKey = (body.idempotencyKey ?? "").trim();
  const playerName = (body.playerName ?? DEFAULT_PLAYER_NAME).trim();

  // --- Validation ---------------------------------------------------------
  if (!idempotencyKey) {
    return NextResponse.json(
      { error: "An idempotencyKey is required." },
      { status: 400 }
    );
  }
  if (idempotencyKey.length > 200) {
    return NextResponse.json(
      { error: "idempotencyKey is too long." },
      { status: 400 }
    );
  }

  const selectionErrors = validateSelection(selectedNumbers);
  if (selectionErrors.length > 0) {
    return NextResponse.json(
      { error: selectionErrors.join(" ") },
      { status: 400 }
    );
  }

  if (
    !Number.isInteger(stakeMinor) ||
    stakeMinor < MIN_STAKE_MINOR ||
    stakeMinor > MAX_STAKE_MINOR
  ) {
    return NextResponse.json(
      {
        error: `Stake must be an integer between ${MIN_STAKE_MINOR} and ${MAX_STAKE_MINOR} minor units.`,
      },
      { status: 400 }
    );
  }

  const spots = selectedNumbers.length;

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Get-or-create the player (auto-provisioned guest).
      let player = await tx.player.findUnique({
        where: { name: playerName },
      });
      if (!player) {
        player = await tx.player.create({
          data: {
            name: playerName,
            balanceMinor: STARTING_BALANCE,
          },
        });
      }

      // 2. Idempotency check: if this key was used, return cached result.
      const existing = await tx.ticket.findUnique({
        where: { idempotencyKey },
        include: {
          ticketResult: true,
          round: { include: { drawResult: true } },
        },
      });
      if (existing) {
        const drawNumbers = existing.round.drawResult
          ? (JSON.parse(existing.round.drawResult.winningNumbers) as number[])
          : [];
        const selNums = JSON.parse(existing.selectedNumbers) as number[];
        return {
          replayed: true,
          player,
          ticket: existing,
          drawnNumbers: drawNumbers,
          matched: existing.ticketResult
            ? (JSON.parse(existing.ticketResult.matchedNumbers) as number[])
            : [],
          matchCount: existing.ticketResult?.matchCount ?? 0,
          payoutMinor: existing.ticketResult?.payoutMinor ?? 0,
          multiplier: getMultiplier(
            existing.spots,
            existing.ticketResult?.matchCount ?? 0
          ),
        };
      }

      // 3. Balance check.
      if (player.balanceMinor < stakeMinor) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // 4. OPEN round.
      const round = await tx.gameRound.create({
        data: {
          status: "OPEN",
          rulesVersion: PAYTABLE_VERSION,
        },
      });

      // 5. Create ticket, snapshot paytable version.
      const ticket = await tx.ticket.create({
        data: {
          playerId: player.id,
          roundId: round.id,
          selectedNumbers: JSON.stringify(
            [...selectedNumbers].sort((a, b) => a - b)
          ),
          spots,
          stakeMinor,
          paytableVersion: PAYTABLE_VERSION,
          status: "SUBMITTED",
          idempotencyKey,
        },
      });

      // 6. Debit stake.
      await tx.ledgerEntry.create({
        data: {
          playerId: player.id,
          ticketId: ticket.id,
          roundId: round.id,
          entryType: "STAKE_DEBIT",
          amountMinor: stakeMinor,
          idempotencyKey: `stake-${idempotencyKey}`,
        },
      });
      player = await tx.player.update({
        where: { id: player.id },
        data: { balanceMinor: { decrement: stakeMinor } },
      });

      // 7. CLOSED round.
      await tx.gameRound.update({
        where: { id: round.id },
        data: { status: "CLOSED", closesAt: new Date() },
      });

      // 8. DRAWN round. Generate 20 unique numbers using CSPRNG.
      const drawn = drawKenoNumbers(KENO_POOL_SIZE, KENO_DRAW_SIZE);
      await tx.drawResult.create({
        data: {
          roundId: round.id,
          winningNumbers: JSON.stringify(drawn),
          algorithmVersion: DRAW_ALGORITHM_VERSION,
        },
      });
      await tx.gameRound.update({
        where: { id: round.id },
        data: { status: "DRAWN", drawnAt: new Date() },
      });

      // 9. Calculate matches and payout.
      const hits = countMatches(selectedNumbers, drawn);
      const matched = matchedNumbers(selectedNumbers, drawn);
      const payoutMinor = calculatePayout(spots, hits, stakeMinor);
      const isWin = payoutMinor > 0;
      const multiplier = getMultiplier(spots, hits);

      // 10. Settle: persist ticket_result + credit payout (idempotent).
      await tx.ticketResult.create({
        data: {
          ticketId: ticket.id,
          matchedNumbers: JSON.stringify(matched),
          matchCount: hits,
          payoutMinor,
          isWin,
        },
      });

      if (payoutMinor > 0) {
        await tx.ledgerEntry.create({
          data: {
            playerId: player.id,
            ticketId: ticket.id,
            roundId: round.id,
            entryType: "PAYOUT_CREDIT",
            amountMinor: payoutMinor,
            idempotencyKey: `payout-${idempotencyKey}`,
          },
        });
        player = await tx.player.update({
          where: { id: player.id },
          data: { balanceMinor: { increment: payoutMinor } },
        });
      }

      // 11. SETTLED round.
      await tx.gameRound.update({
        where: { id: round.id },
        data: { status: "SETTLED", settledAt: new Date() },
      });

      const settledTicket = await tx.ticket.update({
        where: { id: ticket.id },
        data: { status: "SETTLED" },
        include: {
          ticketResult: true,
          round: { include: { drawResult: true } },
        },
      });

      return {
        replayed: false,
        player,
        ticket: settledTicket,
        drawnNumbers: drawn,
        matched,
        matchCount: hits,
        payoutMinor,
        multiplier,
      };
    });

    return NextResponse.json({
      replayed: result.replayed,
      player: {
        id: result.player.id,
        name: result.player.name,
        balanceMinor: result.player.balanceMinor,
      },
      ticket: {
        id: result.ticket.id,
        roundId: result.ticket.roundId,
        selectedNumbers: JSON.parse(result.ticket.selectedNumbers) as number[],
        spots: result.ticket.spots,
        stakeMinor: result.ticket.stakeMinor,
        paytableVersion: result.ticket.paytableVersion,
        status: result.ticket.status,
        createdAt: result.ticket.createdAt,
      },
      round: {
        id: result.ticket.roundId,
        status: result.ticket.round.status,
        rulesVersion: result.ticket.round.rulesVersion,
        opensAt: result.ticket.round.opensAt,
        closesAt: result.ticket.round.closesAt,
        drawnAt: result.ticket.round.drawnAt,
        settledAt: result.ticket.round.settledAt,
      },
      draw: {
        winningNumbers: result.drawnNumbers,
        algorithmVersion: DRAW_ALGORITHM_VERSION,
      },
      result: {
        matchedNumbers: result.matched,
        matchCount: result.matchCount,
        payoutMinor: result.payoutMinor,
        multiplier: result.multiplier,
        netPayoutMinor: result.payoutMinor - Number(result.ticket.stakeMinor),
        isWin: result.payoutMinor > 0,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json(
        { error: "Insufficient balance to place this stake." },
        { status: 402 }
      );
    }
    console.error("[keno/play] error:", err);
    return NextResponse.json(
      { error: "Could not process the ticket at this time." },
      { status: 500 }
    );
  }
}
