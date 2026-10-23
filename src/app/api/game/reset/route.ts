import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_PLAYER_NAME = "guest";
const STARTING_BALANCE = 100000;
const RESTART_BALANCE = 100000;

/**
 * POST /api/game/reset
 *
 * Reset the guest player's balance to the starting amount and create an
 * ADJUSTMENT ledger entry so the audit trail is preserved.
 */
export async function POST() {
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
    return NextResponse.json({
      player: {
        id: player.id,
        name: player.name,
        balanceMinor: player.balanceMinor,
      },
      reset: false,
    });
  }

  const diff = RESTART_BALANCE - player.balanceMinor;
  if (diff !== 0) {
    const idempotencyKey = `reset-${Date.now()}-${player.id}`;
    await db.ledgerEntry.create({
      data: {
        playerId: player.id,
        entryType: "ADJUSTMENT",
        amountMinor: Math.abs(diff),
        idempotencyKey,
      },
    });
    player = await db.player.update({
      where: { id: player.id },
      data: { balanceMinor: RESTART_BALANCE },
    });
  }

  return NextResponse.json({
    player: {
      id: player.id,
      name: player.name,
      balanceMinor: player.balanceMinor,
    },
    reset: true,
  });
}
