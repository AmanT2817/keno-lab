import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  KENO_POOL_SIZE,
  KENO_DRAW_SIZE,
  KENO_MIN_SPOTS,
  KENO_MAX_SPOTS,
  DRAW_ALGORITHM_VERSION,
} from "@/lib/keno/engine";
import { PAYTABLE_VERSION, paytableRowsForSpots } from "@/lib/keno/paytable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PLAYER_NAME = "guest";
const STARTING_BALANCE = 100000;
const MIN_STAKE_MINOR = 100;
const MAX_STAKE_MINOR = 100000;

/**
 * GET /api/game/state
 *
 * Returns the game configuration, the player's current balance, and
 * metadata used to render the board. The browser is given everything
 * it needs to render the UI but no authoritative game outcomes.
 */
export async function GET() {
  // Get-or-create the guest player so the balance shows on first load.
  let player = await db.player.findUnique({
    where: { name: DEFAULT_PLAYER_NAME },
  });
  if (!player) {
    player = await db.player.create({
      data: {
        name: DEFAULT_PLAYER_NAME,
        balanceMinor: STARTING_BALANCE,
      },
    });
  }

  const totalRounds = await db.gameRound.count();
  const totalTickets = await db.ticket.count();
  const lastTicket = await db.ticket.findFirst({
    orderBy: { createdAt: "desc" },
    include: {
      ticketResult: true,
      round: { include: { drawResult: true } },
    },
  });

  return NextResponse.json({
    config: {
      poolSize: KENO_POOL_SIZE,
      drawSize: KENO_DRAW_SIZE,
      minSpots: KENO_MIN_SPOTS,
      maxSpots: KENO_MAX_SPOTS,
      minStakeMinor: MIN_STAKE_MINOR,
      maxStakeMinor: MAX_STAKE_MINOR,
      startingBalanceMinor: STARTING_BALANCE,
      paytableVersion: PAYTABLE_VERSION,
      drawAlgorithmVersion: DRAW_ALGORITHM_VERSION,
      paytablePreview: Object.fromEntries(
        Array.from({ length: KENO_MAX_SPOTS }, (_, i) => i + 1).map((s) => [
          s,
          paytableRowsForSpots(s),
        ])
      ),
    },
    player: {
      id: player.id,
      name: player.name,
      balanceMinor: player.balanceMinor,
    },
    stats: {
      totalRounds,
      totalTickets,
    },
    lastTicket: lastTicket
      ? {
          id: lastTicket.id,
          selectedNumbers: JSON.parse(lastTicket.selectedNumbers) as number[],
          spots: lastTicket.spots,
          stakeMinor: lastTicket.stakeMinor,
          status: lastTicket.status,
          createdAt: lastTicket.createdAt,
          winningNumbers: lastTicket.round.drawResult
            ? (JSON.parse(lastTicket.round.drawResult.winningNumbers) as number[])
            : [],
          matchedNumbers: lastTicket.ticketResult
            ? (JSON.parse(lastTicket.ticketResult.matchedNumbers) as number[])
            : [],
          matchCount: lastTicket.ticketResult?.matchCount ?? 0,
          payoutMinor: lastTicket.ticketResult?.payoutMinor ?? 0,
          isWin: lastTicket.ticketResult?.isWin ?? false,
        }
      : null,
  });
}
