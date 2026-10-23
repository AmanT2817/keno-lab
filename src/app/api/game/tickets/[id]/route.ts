import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/game/tickets/[id]
 *
 * Full audit data for a single ticket. This is the Transparency Center
 * endpoint: it exposes the entire server-authoritative trail — the
 * ticket snapshot (with paytable version), the immutable draw result,
 * the evaluated ticket result, and the ledger entries that moved money.
 *
 * A player or auditor can use this to verify:
 *   - The exact selection and stake submitted.
 *   - Which paytable version was used (snapshot at ticket time).
 *   - The official winning numbers drawn for this round.
 *   - The matched numbers and the payout calculation.
 *   - Every ledger entry (stake debit + payout credit) with idempotency keys.
 *   - The full round state-machine timeline (OPEN -> CLOSED -> DRAWN -> SETTLED).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!id) {
    return NextResponse.json(
      { error: "Ticket id is required." },
      { status: 400 }
    );
  }

  const ticket = await db.ticket.findUnique({
    where: { id },
    include: {
      ticketResult: true,
      round: { include: { drawResult: true } },
      ledgerEntries: {
        orderBy: { createdAt: "asc" },
      },
      player: {
        select: { id: true, name: true },
      },
    },
  });

  if (!ticket) {
    return NextResponse.json({ error: "Ticket not found." }, { status: 404 });
  }

  return NextResponse.json({
    ticket: {
      id: ticket.id,
      selectedNumbers: JSON.parse(ticket.selectedNumbers) as number[],
      spots: ticket.spots,
      stakeMinor: ticket.stakeMinor,
      paytableVersion: ticket.paytableVersion,
      status: ticket.status,
      idempotencyKey: ticket.idempotencyKey,
      createdAt: ticket.createdAt,
      player: ticket.player,
    },
    round: {
      id: ticket.round.id,
      status: ticket.round.status,
      rulesVersion: ticket.round.rulesVersion,
      opensAt: ticket.round.opensAt,
      closesAt: ticket.round.closesAt,
      drawnAt: ticket.round.drawnAt,
      settledAt: ticket.round.settledAt,
    },
    draw: ticket.round.drawResult
      ? {
          winningNumbers: JSON.parse(
            ticket.round.drawResult.winningNumbers
          ) as number[],
          algorithmVersion: ticket.round.drawResult.algorithmVersion,
          createdAt: ticket.round.drawResult.createdAt,
        }
      : null,
    result: ticket.ticketResult
      ? {
          matchedNumbers: JSON.parse(
            ticket.ticketResult.matchedNumbers
          ) as number[],
          matchCount: ticket.ticketResult.matchCount,
          payoutMinor: ticket.ticketResult.payoutMinor,
          isWin: ticket.ticketResult.isWin,
          createdAt: ticket.ticketResult.createdAt,
        }
      : null,
    ledger: ticket.ledgerEntries.map((e) => ({
      id: e.id,
      entryType: e.entryType,
      amountMinor: e.amountMinor,
      idempotencyKey: e.idempotencyKey,
      createdAt: e.createdAt,
    })),
  });
}
