import { NextResponse } from "next/server";
import { getCurrentRoundState } from "@/lib/keno/rounds";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * GET /api/game/current-round
 *
 * Returns the current scheduled round state, including:
 *   - Round ID, number, status, scheduled timestamps
 *   - Current phase (OPEN / DRAWING / RESULTS / WAITING)
 *   - Countdown to the next phase transition (server-driven)
 *   - The revealed subset of drawn numbers (progressive reveal
 *     driven by `drawnAt` + 1s per number)
 *   - Server time (so clients can stay synced even with clock drift)
 *
 * Calling this endpoint also advances the round state machine if
 * needed (lazy evaluation). The round schedule is server-authoritative
 * — clients cannot speed it up, slow it down, or trigger duplicate
 * draws by calling this endpoint repeatedly.
 */
export async function GET() {
  const state = await getCurrentRoundState();
  if (!state) {
    return NextResponse.json(
      { error: "No round available.", round: null },
      { status: 503 }
    );
  }
  return NextResponse.json(state);
}
