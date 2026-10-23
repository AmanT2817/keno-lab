import { randomInt } from "node:crypto";

/**
 * Total number pool for Keno.
 * Numbers are 1..KENO_POOL_SIZE (typically 80).
 */
export const KENO_POOL_SIZE = 80;

/**
 * How many numbers are drawn each round (without replacement).
 */
export const KENO_DRAW_SIZE = 20;

/**
 * Min/max spots a player may select.
 */
export const KENO_MIN_SPOTS = 1;
export const KENO_MAX_SPOTS = 10;

/**
 * Algorithm version tag persisted with each draw for auditability.
 * Bump this if the draw mechanism changes.
 */
export const DRAW_ALGORITHM_VERSION = "fisher-yates-csprng-v1";

/**
 * Generate 20 unique winning Keno numbers using Fisher-Yates shuffle
 * seeded by Node's cryptographically secure PRNG (node:crypto.randomInt).
 *
 * Each 20-number subset has equal selection probability. Runs in O(80).
 */
export function drawKenoNumbers(
  poolSize: number = KENO_POOL_SIZE,
  drawSize: number = KENO_DRAW_SIZE
): number[] {
  const numbers = Array.from({ length: poolSize }, (_, i) => i + 1);

  // Fisher-Yates shuffle from the end of the array to the beginning.
  for (let i = numbers.length - 1; i > 0; i--) {
    const j = randomInt(i + 1); // unbiased random index in [0, i]
    [numbers[i], numbers[j]] = [numbers[j], numbers[i]];
  }

  return numbers.slice(0, drawSize).sort((a, b) => a - b);
}

/**
 * Count how many of the player's selected numbers match the drawn numbers.
 * Implemented as a set intersection for clarity and performance.
 *
 * matches = |S ∩ D|
 */
export function countMatches(selected: number[], drawn: number[]): number {
  const drawnSet = new Set(drawn);
  let hits = 0;
  for (const n of selected) {
    if (drawnSet.has(n)) hits++;
  }
  return hits;
}

/**
 * Return the actual matched numbers (intersection), sorted ascending.
 */
export function matchedNumbers(selected: number[], drawn: number[]): number[] {
  const drawnSet = new Set(drawn);
  return selected.filter((n) => drawnSet.has(n)).sort((a, b) => a - b);
}

/**
 * Validate a player's selection for Keno.
 * Returns a list of human-readable error strings, empty if valid.
 */
export function validateSelection(selected: number[]): string[] {
  const errors: string[] = [];

  if (!Array.isArray(selected)) {
    return ["Selection must be an array of numbers."];
  }

  if (selected.length < KENO_MIN_SPOTS || selected.length > KENO_MAX_SPOTS) {
    errors.push(
      `You must select between ${KENO_MIN_SPOTS} and ${KENO_MAX_SPOTS} numbers.`
    );
  }

  const seen = new Set<number>();
  for (const n of selected) {
    if (!Number.isInteger(n) || n < 1 || n > KENO_POOL_SIZE) {
      errors.push(`Number ${n} is out of range (1-${KENO_POOL_SIZE}).`);
      continue;
    }
    if (seen.has(n)) {
      errors.push(`Duplicate number ${n} is not allowed.`);
    }
    seen.add(n);
  }

  return errors;
}
