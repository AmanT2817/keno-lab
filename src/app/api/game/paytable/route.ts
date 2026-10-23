import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import {
  KENO_MAX_SPOTS,
  KENO_MIN_SPOTS,
} from "@/lib/keno/engine";
import { paytableRowsForSpots } from "@/lib/keno/paytable";
import {
  hypergeometricPmf,
  hypergeometricAtLeast,
  formatOneInN,
  expectedReturnMultiplier,
  houseEdgePercent,
} from "@/lib/keno/probability";
import { getMultiplier } from "@/lib/keno/paytable";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/game/paytable?spots=N
 *
 * Returns the paytable rows + hypergeometric probabilities for the given
 * spot count. This is purely informational: the browser is told the
 * multipliers so the player can see what each hit count is worth, but the
 * actual payout is computed server-side from the same versioned table.
 */
export async function GET(req: NextRequest) {
  const spotsParam = req.nextUrl.searchParams.get("spots");
  const spots = spotsParam ? Number(spotsParam) : 0;

  if (
    !Number.isInteger(spots) ||
    spots < KENO_MIN_SPOTS ||
    spots > KENO_MAX_SPOTS
  ) {
    return NextResponse.json(
      { error: "Invalid spots parameter." },
      { status: 400 }
    );
  }

  const rows = paytableRowsForSpots(spots).map((row) => {
    const p = hypergeometricPmf(spots, row.hits);
    return {
      hits: row.hits,
      multiplier: row.multiplier,
      probability: p,
      probabilityLabel: formatOneInN(p),
      expectedContribution: p * row.multiplier,
    };
  });

  // Probability of "any win" = P(X >= lowest-winning-hits).
  const lowestWinningHits = rows.find((r) => r.multiplier > 0)?.hits ?? spots;
  const anyWinProbability = hypergeometricAtLeast(spots, lowestWinningHits);

  const expectedReturn = expectedReturnMultiplier(spots, getMultiplier);
  const houseEdge = houseEdgePercent(spots, getMultiplier);

  return NextResponse.json({
    spots,
    rows,
    anyWinProbability,
    anyWinLabel: formatOneInN(anyWinProbability),
    expectedReturnMultiplier: expectedReturn,
    houseEdgePercent: houseEdge,
  });
}
