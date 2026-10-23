/**
 * Hypergeometric probability calculations for Keno.
 *
 * In Keno, a player picks n numbers (spots), the house draws 20 unique
 * numbers without replacement from 1..80, and we ask: what is the
 * probability of matching exactly r of the n picked numbers?
 *
 *   P(X = r) = C(n, r) * C(80 - n, 20 - r) / C(80, 20)
 *
 * This is the standard hypergeometric distribution because the draws
 * are without replacement.
 */

import { KENO_DRAW_SIZE, KENO_POOL_SIZE } from "./engine";

/**
 * Compute the natural log of the binomial coefficient C(n, k) using the
 * log-gamma identity. We use logs to avoid overflow with large n.
 *
 *   C(n, k) = n! / (k! * (n - k)!)
 *   log C(n, k) = lgamma(n+1) - lgamma(k+1) - lgamma(n-k+1)
 *
 * We use Stirling's series for lgamma.
 */
function lgamma(x: number): number {
  // Lanczos approximation for log Gamma.
  // Coefficients from the standard "g=7, n=9" Lanczos setup.
  const g = 7;
  const c = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502914983819,
    12.507343278686905,
    -0.13857109526572012,
    9.9843695780195716e-6,
    1.5056327351493116e-7,
  ];

  if (x < 0.5) {
    // Reflection formula: Gamma(x) * Gamma(1-x) = pi / sin(pi*x)
    return (
      Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x)
    );
  }

  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < c.length; i++) {
    a += c[i] / (x + i);
  }
  return (
    0.5 * Math.log(2 * Math.PI) +
    (x + 0.5) * Math.log(t) -
    t +
    Math.log(a)
  );
}

function logBinom(n: number, k: number): number {
  if (k < 0 || k > n) return -Infinity;
  if (k === 0 || k === n) return 0;
  return lgamma(n + 1) - lgamma(k + 1) - lgamma(n - k + 1);
}

/**
 * Probability of matching exactly r out of n selected Keno numbers
 * when 20 are drawn without replacement from a pool of 80.
 *
 * Returns a number in [0, 1].
 */
export function hypergeometricPmf(
  n: number,
  r: number,
  poolSize: number = KENO_POOL_SIZE,
  drawSize: number = KENO_DRAW_SIZE
): number {
  if (r < 0 || r > n || r > drawSize) return 0;
  if (drawSize - r > poolSize - n) return 0;

  const logP =
    logBinom(n, r) +
    logBinom(poolSize - n, drawSize - r) -
    logBinom(poolSize, drawSize);
  return Math.exp(logP);
}

/**
 * Probability of matching at least r out of n selected numbers.
 *
 *   P(X >= r) = sum_{k=r}^{n} P(X = k)
 *
 * Useful for "1 in N chance" displays.
 */
export function hypergeometricAtLeast(
  n: number,
  r: number,
  poolSize: number = KENO_POOL_SIZE,
  drawSize: number = KENO_DRAW_SIZE
): number {
  let p = 0;
  for (let k = r; k <= n; k++) {
    p += hypergeometricPmf(n, k, poolSize, drawSize);
  }
  return p;
}

/**
 * Format a probability as "1 in N" where N is rounded to a sensible
 * number of significant figures.
 */
export function formatOneInN(p: number): string {
  if (!isFinite(p) || p <= 0) return "0";
  if (p >= 1) return "1 in 1";
  const n = 1 / p;
  if (n < 10) return `1 in ${n.toFixed(2)}`;
  if (n < 100) return `1 in ${n.toFixed(1)}`;
  if (n < 10000) return `1 in ${Math.round(n).toLocaleString()}`;
  return `1 in ${Math.round(n).toLocaleString()}`;
}

/**
 * Expected return multiplier for a given spot count.
 * Sum over r of [ P(X=r) * multiplier(spots, r) ].
 *
 * A value < 1 means a negative expected value (house edge).
 */
export function expectedReturnMultiplier(
  spots: number,
  multiplierLookup: (spots: number, hits: number) => number
): number {
  let expected = 0;
  for (let r = 0; r <= spots; r++) {
    const p = hypergeometricPmf(spots, r);
    const m = multiplierLookup(spots, r);
    expected += p * m;
  }
  return expected;
}

/**
 * House edge percentage for a given spot count.
 *
 *   houseEdge = (1 - expectedReturn) * 100
 *
 * Returns a percentage like 27.3 (meaning the house keeps 27.3% on average).
 */
export function houseEdgePercent(
  spots: number,
  multiplierLookup: (spots: number, hits: number) => number
): number {
  const er = expectedReturnMultiplier(spots, multiplierLookup);
  return (1 - er) * 100;
}
