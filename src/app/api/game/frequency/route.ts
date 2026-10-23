import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { KENO_POOL_SIZE, KENO_DRAW_SIZE } from "@/lib/keno/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const VALID_PERIODS = [20, 50, 100, "all"] as const;
type Period = (typeof VALID_PERIODS)[number];

/**
 * GET /api/game/frequency?period=20|50|100|all
 *
 * Returns the historical frequency of each Keno number across persisted
 * COMPLETED draws, optionally filtered to the last N rounds.
 *
 * Hot/cold classification:
 *   - mean = (draws × 20) / 80  (theoretical expected count per number)
 *   - A number is "hot"  if its count exceeds mean × 1.15 (15% above average)
 *   - A number is "cold"  if its count is below mean × 0.85 (15% below average)
 *   - Otherwise "neutral"
 *
 * Color intensity (for the UI heatmap) is derived from the z-score:
 *   (count - mean) / stddev
 *
 * IMPORTANT: past appearance frequency does NOT influence future draws.
 * Every draw is uniformly random without replacement. Hot/cold labels
 * describe observed past data only.
 */
export async function GET(req: NextRequest) {
  const periodParam = req.nextUrl.searchParams.get("period") ?? "all";

  let period: Period;
  if (periodParam === "all") {
    period = "all";
  } else {
    const n = Number(periodParam);
    if (!VALID_PERIODS.includes(n as Period)) {
      return NextResponse.json(
        {
          error: `Invalid period. Use one of: ${VALID_PERIODS.join(", ")}.`,
        },
        { status: 400 }
      );
    }
    period = n as Period;
  }

  // Fetch only COMPLETED draws (those with a persisted DrawResult —
  // i.e. rounds that have actually been drawn). Order by creation desc
  // so we can slice to the most recent N for the period filter.
  const drawResults = await db.drawResult.findMany({
    where: { round: { status: { in: ["DRAWN", "SETTLED", "ARCHIVED"] } } },
    orderBy: { createdAt: "desc" },
    select: { winningNumbers: true, createdAt: true, roundId: true },
  });

  const totalCount = drawResults.length;
  const filteredDraws =
    period === "all" ? drawResults : drawResults.slice(0, period);
  const totalDraws = filteredDraws.length;

  const counts = new Array<number>(KENO_POOL_SIZE + 1).fill(0);
  for (const d of filteredDraws) {
    let nums: number[] = [];
    try {
      nums = JSON.parse(d.winningNumbers) as number[];
    } catch {
      continue;
    }
    for (const n of nums) {
      if (n >= 1 && n <= KENO_POOL_SIZE) counts[n]++;
    }
  }

  const mean = (totalDraws * KENO_DRAW_SIZE) / KENO_POOL_SIZE;
  const hotThreshold = mean * 1.15;
  const coldThreshold = mean * 0.85;

  // Standard deviation across the 80 counts.
  let variance = 0;
  for (let i = 1; i <= KENO_POOL_SIZE; i++) {
    variance += (counts[i] - mean) ** 2;
  }
  variance /= KENO_POOL_SIZE;
  const stddev = Math.sqrt(variance) || 1; // avoid div by zero

  const numbers = Array.from({ length: KENO_POOL_SIZE }, (_, i) => {
    const n = i + 1;
    const count = counts[n];
    const z = (count - mean) / stddev;
    let classification: "hot" | "cold" | "neutral" = "neutral";
    if (count > hotThreshold) classification = "hot";
    else if (count < coldThreshold) classification = "cold";
    return {
      number: n,
      count,
      percentage:
        totalDraws === 0 ? 0 : (count / (totalDraws * KENO_DRAW_SIZE)) * 100,
      zScore: Number(z.toFixed(3)),
      classification,
      // Rounds since last appearance (from the most recent draw backwards).
      roundsSinceLastAppearance: computeRoundsSinceLastAppearance(
        filteredDraws,
        n
      ),
    };
  });

  const sortedByCount = [...numbers].sort(
    (a, b) => b.count - a.count || a.number - b.number
  );
  const hottest = sortedByCount.slice(0, 10);
  const coldest = sortedByCount.slice(-10).reverse();

  const theoreticalPercentage = (KENO_DRAW_SIZE / KENO_POOL_SIZE) * 100;

  return NextResponse.json({
    period,
    totalDraws,
    theoreticalPercentagePerNumber: theoreticalPercentage,
    averageAppearancesPerNumber: Number(mean.toFixed(2)),
    hotThreshold: Number(hotThreshold.toFixed(2)),
    coldThreshold: Number(coldThreshold.toFixed(2)),
    classificationMethod:
      "Hot = count > mean × 1.15; Cold = count < mean × 0.85; " +
      "Neutral = in between. Mean = (draws × 20) / 80.",
    numbers,
    hottest,
    coldest,
    disclaimer:
      "Past appearance frequency does NOT influence future draws. " +
      "Every round is an independent uniformly random draw without " +
      "replacement. Hot/cold labels describe observed past data only " +
      "and do not make any number more or less likely to appear next.",
  });
}

function computeRoundsSinceLastAppearance(
  draws: { winningNumbers: string; createdAt: Date; roundId: string }[],
  targetNumber: number
): number {
  // draws are ordered newest-first; find the index of the most recent
  // draw containing targetNumber. If never appeared, return total draws.
  for (let i = 0; i < draws.length; i++) {
    let nums: number[] = [];
    try {
      nums = JSON.parse(draws[i].winningNumbers) as number[];
    } catch {
      continue;
    }
    if (nums.includes(targetNumber)) return i;
  }
  return draws.length;
}
