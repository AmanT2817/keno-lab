import { NextResponse } from "next/server";
import { db } from "@/lib/db";
import { KENO_POOL_SIZE } from "@/lib/keno/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/game/frequency
 *
 * Returns the historical frequency of each Keno number across all
 * persisted draws. This is observational data only — past appearance
 * has zero bearing on future independent draws (the draws are
 * uniformly random without replacement each round).
 *
 * Response shape:
 *   {
 *     totalDraws: number,
 *     numbers: [{ number, count, percentage }],
 *     hottest: [{ number, count, percentage }],  // top 10
 *     coldest: [{ number, count, percentage }]   // bottom 10
 *   }
 */
export async function GET() {
  const drawResults = await db.drawResult.findMany({
    select: { winningNumbers: true },
  });

  const totalDraws = drawResults.length;
  const counts = new Array<number>(KENO_POOL_SIZE + 1).fill(0);

  for (const d of drawResults) {
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

  const numbers = Array.from({ length: KENO_POOL_SIZE }, (_, i) => {
    const n = i + 1;
    return {
      number: n,
      count: counts[n],
      percentage:
        totalDraws === 0 ? 0 : (counts[n] / (totalDraws * 20)) * 100,
    };
  });

  const sortedByCount = [...numbers].sort(
    (a, b) => b.count - a.count || a.number - b.number
  );
  const hottest = sortedByCount.slice(0, 10);
  const coldest = sortedByCount.slice(-10).reverse();

  // Theoretical expected percentage per number = 20/80 = 25%.
  const theoreticalPercentage = (20 / KENO_POOL_SIZE) * 100;

  return NextResponse.json({
    totalDraws,
    theoreticalPercentagePerNumber: theoreticalPercentage,
    numbers,
    hottest,
    coldest,
    disclaimer:
      "Past appearance frequency does not influence future draws. " +
      "Every draw is uniformly random without replacement.",
  });
}
