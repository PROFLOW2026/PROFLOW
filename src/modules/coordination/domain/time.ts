/**
 * Wall-clock <-> instant conversion for `datetime-local` inputs. Site events are entered in the
 * organization's time zone (e.g. Asia/Jerusalem), not the server's, so a pour at 07:00 stays 07:00.
 */

const WALL_CLOCK = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function zonedParts(instant: Date, timeZone: string): Record<string, number> {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(instant)) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value);
  }
  return parts;
}

function offsetMs(instant: Date, timeZone: string): number {
  const p = zonedParts(instant, timeZone);
  const asUtc = Date.UTC(p.year!, p.month! - 1, p.day!, p.hour! % 24, p.minute!, p.second!);
  return asUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

/** "2026-10-05T07:00" in `timeZone` -> Date. Returns null for malformed input. */
export function wallClockToInstant(value: string, timeZone: string): Date | null {
  const match = WALL_CLOCK.exec(value.trim());
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match;
  const guess = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  if (Number.isNaN(guess)) return null;
  let result = guess - offsetMs(new Date(guess), timeZone);
  const corrected = guess - offsetMs(new Date(result), timeZone);
  if (corrected !== result) result = corrected;
  return new Date(result);
}

/** Date -> "YYYY-MM-DDTHH:mm" in `timeZone` (for `datetime-local` default values). */
export function instantToWallClock(instant: Date, timeZone: string): string {
  const p = zonedParts(instant, timeZone);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.year}-${pad(p.month!)}-${pad(p.day!)}T${pad(p.hour! % 24)}:${pad(p.minute!)}`;
}

/** Accepts an ISO instant (with zone) or a wall-clock value interpreted in `timeZone`. */
export function parseEventInstant(value: string | Date | null | undefined, timeZone: string): Date | null {
  if (value === null || value === undefined) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (/[zZ]$|[+-]\d{2}:?\d{2}$/.test(trimmed)) {
    const parsed = new Date(trimmed);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return wallClockToInstant(trimmed, timeZone);
}
