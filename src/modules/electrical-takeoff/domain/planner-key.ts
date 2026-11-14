/**
 * Normalize a planner / office name into a stable library scope key.
 */

const UNKNOWN = 'unknown';

export function normalizePlannerKey(raw: string | null | undefined): string {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) return UNKNOWN;
  const collapsed = trimmed.replace(/\s+/g, ' ').toLowerCase();
  const ascii = collapsed
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\u0590-\u05ff _-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 64);
  return ascii || UNKNOWN;
}

export function plannerKeysMatch(a: string, b: string): boolean {
  return normalizePlannerKey(a) === normalizePlannerKey(b);
}