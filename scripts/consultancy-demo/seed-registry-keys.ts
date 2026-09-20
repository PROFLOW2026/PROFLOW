/** Must stay aligned with `SEED_MARKER` in constants.ts — not imported to keep unit tests out of script graph. */
const SEED_MARKER = 'PF-CONSULTANCY-DEMO';

/** Internal idempotency registry — never written to user-visible fields. */
export type SeedRegistry = Record<string, string>;

export function seedTaskRegistryKey(docNum: string, index: number): string {
  return `task:${docNum}:${index}`;
}

export function seedAdminTaskRegistryKey(index: number): string {
  return `admin-task:${index}`;
}

export function seedMeetingRegistryKey(index: number): string {
  return `meeting:${index}`;
}

export function parseSeedTaskRegistryKey(
  key: string,
): { docNum: string; index: number } | null {
  const match = /^task:(\d+):(\d+)$/.exec(key);
  if (!match) return null;
  return { docNum: match[1]!, index: Number(match[2]) };
}

export function parseSeedAdminTaskRegistryKey(key: string): number | null {
  const match = /^admin-task:(\d+)$/.exec(key);
  if (!match) return null;
  return Number(match[1]);
}

/** Returns true when text would leak an internal seed marker to users. */
export function containsVisibleSeedMarker(text: string | null | undefined): boolean {
  if (!text) return false;
  return text.includes(SEED_MARKER);
}
