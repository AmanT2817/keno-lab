import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PLAYER_NAME = "guest";

/**
 * GET /api/game/history
 *
 * Return the player's most recent tickets (with results and draws) so the
 * history panel can render. Server is authoritative: the browser receives
 * immutable persisted outcomes only.
 */
export async function GET() {
  const player = await db.player.findUnique({
    where: { name: DEFAULT_PLAYER_NAME },
  });

  if (!player) {
    return NextResponse.json({ items: [] });
  }

  const tickets = await db.ticket.findMany({
    where: { playerId: player.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    include: {
      ticketResult: true,
      round: { include: { drawResult: true } },
    },
  });

  const items = tickets.map((t) => ({
    id: t.id,
    selectedNumbers: JSON.parse(t.selectedNumbers) as number[],
    spots: t.spots,
    stakeMinor: t.stakeMinor,
    status: t.status,
    createdAt: t.createdAt,
    winningNumbers: t.round.drawResult
      ? (JSON.parse(t.round.drawResult.winningNumbers) as number[])
      : [],
    matchedNumbers: t.ticketResult
      ? (JSON.parse(t.ticketResult.matchedNumbers) as number[])
      : [],
    matchCount: t.ticketResult?.matchCount ?? 0,
    payoutMinor: t.ticketResult?.payoutMinor ?? 0,
    isWin: t.ticketResult?.isWin ?? false,
    roundStatus: t.round.status,
    rulesVersion: t.round.rulesVersion,
  }));

  return NextResponse.json({ items });
}
