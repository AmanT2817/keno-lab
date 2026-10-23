/**
 * Versioned Keno paytable.
 *
 * Convention: every multiplier is "for 1". If a player stakes S minor units
 * and hits h numbers, the payout = S * multiplier(spots, h).
 *
 * A multiplier of 0 means "no payout" (the stake is lost).
 * A multiplier of 1 means "stake returned, no profit".
 * A multiplier > 1 means "stake returned plus profit".
 *
 * The numbers below are tuned to a target house edge of roughly 25% across
 * most spot counts, which is typical for live casino Keno. These are
 * illustrative only, not a certified real-money paytable.
 */

export type PaytableMap = Record<number, Record<number, number>>;

export const PAYTABLE_VERSION = "keno-standard-v1";

export const PAYTABLE: PaytableMap = {
  // 1-spot
  1: {
    0: 0,
    1: 3,
  },
  // 2-spot
  2: {
    0: 0,
    1: 0,
    2: 11,
  },
  // 3-spot
  3: {
    0: 0,
    1: 0,
    2: 2,
    3: 42,
  },
  // 4-spot
  4: {
    0: 0,
    1: 0,
    2: 1,
    3: 5,
    4: 120,
  },
  // 5-spot
  5: {
    0: 0,
    1: 0,
    2: 0,
    3: 2,
    4: 18,
    5: 800,
  },
  // 6-spot
  6: {
    0: 0,
    1: 0,
    2: 0,
    3: 1,
    4: 8,
    5: 80,
    6: 1500,
  },
  // 7-spot
  7: {
    0: 0,
    1: 0,
    2: 0,
    3: 1,
    4: 5,
    5: 25,
    6: 350,
    7: 5000,
  },
  // 8-spot
  8: {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 4,
    5: 15,
    6: 90,
    7: 2000,
    8: 15000,
  },
  // 9-spot
  9: {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 3,
    5: 12,
    6: 50,
    7: 500,
    8: 5000,
    9: 25000,
  },
  // 10-spot
  10: {
    0: 0,
    1: 0,
    2: 0,
    3: 0,
    4: 2,
    5: 10,
    6: 25,
    7: 150,
    8: 1500,
    9: 10000,
    10: 50000,
  },
};

/**
 * Look up the payout multiplier for a (spots, hits) pair.
 * Returns 0 if undefined.
 */
export function getMultiplier(spots: number, hits: number): number {
  return PAYTABLE[spots]?.[hits] ?? 0;
}

/**
 * Calculate the payout for a ticket.
 *
 *   payout = stake * multiplier(spots, hits)
 *
 * All values are integer minor units.
 */
export function calculatePayout(
  spots: number,
  hits: number,
  stakeMinor: number
): number {
  const m = getMultiplier(spots, hits);
  return Math.floor(stakeMinor * m);
}

/**
 * Return the paytable rows for a given spot count, sorted by hits ascending.
 * Useful for UI display.
 */
export function paytableRowsForSpots(spots: number): { hits: number; multiplier: number }[] {
  const rows: { hits: number; multiplier: number }[] = [];
  const table = PAYTABLE[spots];
  if (!table) return rows;
  for (const hits of Object.keys(table).map(Number).sort((a, b) => a - b)) {
    rows.push({ hits, multiplier: table[hits] });
  }
  return rows;
}
