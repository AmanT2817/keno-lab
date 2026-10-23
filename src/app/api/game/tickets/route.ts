import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { advanceRoundsIfNeeded } from "@/lib/keno/rounds";
import {
  validateSelection,
  KENO_MAX_SPOTS,
  KENO_MIN_SPOTS,
} from "@/lib/keno/engine";
import { PAYTABLE_VERSION } from "@/lib/keno/paytable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PLAYER_NAME = "guest";
const MIN_STAKE_MINOR = 100;
const MAX_STAKE_MINOR = 100000;
const STARTING_BALANCE = 100000;

interface SubmitRequestBody {
  selectedNumbers?: number[];
  stakeMinor?: number;
  idempotencyKey?: string;
  playerName?: string;
}

/**
 * POST /api/game/tickets
 *
 * Submit a ticket for the CURRENT scheduled OPEN round. The ticket is
 * stored and the stake is debited (idempotent). The draw and settlement
 * do NOT happen here — they happen later, when the round transitions
 * through CLOSED -> DRAWN -> SETTLED via `advanceRoundsIfNeeded()`.
 *
 * The server rejects submissions if:
 *   - The round is not currently OPEN (betting has closed)
 *   - The idempotencyKey has already been used (returns cached ticket)
 *   - The balance is insufficient
 *
 * This is the fundamental change from the old instant-play flow: a
 * ticket no longer triggers its own draw. Many tickets can be attached
 * to one scheduled round, and the round draws and settles on its own
 * clock independently of any individual ticket submission.
 */
export async function POST(req: NextRequest) {
  let body: SubmitRequestBody;
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

  // --- Idempotency check: replay the cached ticket if key was used ----
  const existing = await db.ticket.findUnique({
    where: { idempotencyKey },
    include: {
      ticketResult: true,
      round: true,
    },
  });
  if (existing) {
    return NextResponse.json({
      replayed: true,
      ticket: {
        id: existing.id,
        roundId: existing.roundId,
        roundNumber: existing.round.roundNumber,
        selectedNumbers: JSON.parse(existing.selectedNumbers) as number[],
        spots: existing.spots,
        stakeMinor: existing.stakeMinor,
        paytableVersion: existing.paytableVersion,
        status: existing.status,
        createdAt: existing.createdAt,
      },
      result: existing.ticketResult
        ? {
            matchedNumbers: JSON.parse(
              existing.ticketResult.matchedNumbers
            ) as number[],
            matchCount: existing.ticketResult.matchCount,
            payoutMinor: existing.ticketResult.payoutMinor,
            isWin: existing.ticketResult.isWin,
          }
        : null,
    });
  }

  // --- Advance the round state machine, then fetch the current OPEN round
  await advanceRoundsIfNeeded();

  const currentRound = await db.gameRound.findFirst({
    where: { scheduledClosesAt: { not: null } },
    orderBy: { scheduledClosesAt: "desc" },
  });

  if (!currentRound || currentRound.status !== "OPEN") {
    return NextResponse.json(
      {
        error: "Betting is closed for this round. Wait for the next round to open.",
        phase: currentRound?.status ?? "UNKNOWN",
      },
      { status: 409 }
    );
  }

  try {
    const result = await db.$transaction(async (tx) => {
      // 1. Get-or-create the player.
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

      // 2. Balance check.
      if (player.balanceMinor < stakeMinor) {
        throw new Error("INSUFFICIENT_BALANCE");
      }

      // 3. Create the ticket attached to the current OPEN round.
      const ticket = await tx.ticket.create({
        data: {
          playerId: player.id,
          roundId: currentRound.id,
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

      // 4. Debit the stake (idempotent ledger entry).
      await tx.ledgerEntry.create({
        data: {
          playerId: player.id,
          ticketId: ticket.id,
          roundId: currentRound.id,
          entryType: "STAKE_DEBIT",
          amountMinor: stakeMinor,
          idempotencyKey: `stake-${idempotencyKey}`,
        },
      });

      player = await tx.player.update({
        where: { id: player.id },
        data: { balanceMinor: { decrement: stakeMinor } },
      });

      return { ticket, player };
    });

    return NextResponse.json({
      replayed: false,
      ticket: {
        id: result.ticket.id,
        roundId: result.ticket.roundId,
        roundNumber: currentRound.roundNumber,
        selectedNumbers: JSON.parse(result.ticket.selectedNumbers) as number[],
        spots: result.ticket.spots,
        stakeMinor: result.ticket.stakeMinor,
        paytableVersion: result.ticket.paytableVersion,
        status: result.ticket.status,
        createdAt: result.ticket.createdAt,
      },
      player: {
        id: result.player.id,
        name: result.player.name,
        balanceMinor: result.player.balanceMinor,
      },
      // No `result` field — the draw + settlement happen later, when
      // the round transitions through DRAWN -> SETTLED. The client can
      // poll /api/game/tickets/[id] to fetch the outcome once settled.
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    if (message === "INSUFFICIENT_BALANCE") {
      return NextResponse.json(
        { error: "Insufficient balance to place this stake." },
        { status: 402 }
      );
    }
    console.error("[tickets] error:", err);
    return NextResponse.json(
      { error: "Could not submit the ticket at this time." },
      { status: 500 }
    );
  }
}
