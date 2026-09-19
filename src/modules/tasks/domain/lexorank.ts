/**
 * LexoRank implementation for stable drag/drop ordering.
 *
 * Keys are alphanumeric strings. Ordering is lexicographic (a < b < c … < z).
 * This is a simplified LexoRank suitable for use with PostgreSQL TEXT columns.
 */

const MIN_CHAR = '0';
const MAX_CHAR = 'z';
const CHARS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const MID_CHAR = CHARS[Math.floor(CHARS.length / 2)]!; // 'M'

/**
 * Generates a random initial sort key near the middle of the range.
 */
export function generateSortKey(): string {
  return MID_CHAR + randomSuffix(8);
}

function randomSuffix(length: number): string {
  let result = '';
  for (let i = 0; i < length; i++) {
    result += CHARS[Math.floor(Math.random() * CHARS.length)];
  }
  return result;
}

/**
 * Returns a sort key between `a` and `b`.
 * Both `a` and `b` must be non-empty. `a` must be lexicographically less than `b`.
 * If there's no room, appends a mid character.
 */
export function insertBetween(a: string, b: string): string {
  if (a >= b) {
    throw new Error(`insertBetween: a (${a}) must be less than b (${b})`);
  }

  // Pad to equal length
  const maxLen = Math.max(a.length, b.length);
  const pa = a.padEnd(maxLen, MIN_CHAR);
  const pb = b.padEnd(maxLen, MIN_CHAR);

  let result = '';
  for (let i = 0; i < maxLen; i++) {
    const ca = CHARS.indexOf(pa[i]!);
    const cb = CHARS.indexOf(pb[i]!);
    if (cb - ca > 1) {
      // Found room to insert mid-way
      const mid = Math.floor((ca + cb) / 2);
      result += CHARS[mid];
      return result + pa.slice(i + 1);
    }
    result += pa[i];
  }

  // No room between them at this length; append a mid character
  return result + MID_CHAR;
}

/**
 * Rebalances a set of keys when they become too dense to insert between.
 * Returns evenly spaced new keys for all items (same count).
 */
export function rebalanceBucket(keys: string[]): string[] {
  const count = keys.length;
  if (count === 0) return [];

  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    // Space items evenly across the CHARS range
    const charIdx = Math.floor((i + 1) * (CHARS.length / (count + 1)));
    result.push((CHARS[charIdx] ?? MID_CHAR) + randomSuffix(8));
  }

  return result;
}

/**
 * Returns a sort key to place an item at the end of the list.
 * `lastKey` is the current highest key in the bucket.
 */
export function appendAfter(lastKey: string): string {
  const firstChar = lastKey[0] ?? MIN_CHAR;
  const idx = CHARS.indexOf(firstChar);
  if (idx < CHARS.length - 1) {
    return CHARS[idx + 1]! + randomSuffix(8);
  }
  // Append a mid char to go deeper
  return lastKey + MID_CHAR;
}

/**
 * Returns a sort key to place an item at the beginning (before `firstKey`).
 */
export function prependBefore(firstKey: string): string {
  const firstChar = firstKey[0] ?? MAX_CHAR;
  const idx = CHARS.indexOf(firstChar);
  if (idx > 0) {
    return CHARS[idx - 1]! + randomSuffix(8);
  }
  // Can't go below MIN_CHAR; use insert-between with empty string
  return MIN_CHAR + randomSuffix(8);
}
