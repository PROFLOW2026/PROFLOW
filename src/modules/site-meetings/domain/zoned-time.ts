/** `<input type="datetime-local">` values interpreted in the organization's time zone. */

const LOCAL_INPUT = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/;

function zoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'));
  return asUtc - instant.getTime();
}

/** Wall-clock local time in `timeZone` -> UTC instant. Values with an explicit offset pass through. */
export function parseZonedLocalDateTime(value: string | Date, timeZone: string): Date | null {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  const match = LOCAL_INPUT.exec(value.trim());
  if (!match) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  const [, y, mo, d, h, mi, s] = match;
  const wall = Date.UTC(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi), Number(s ?? 0));
  const firstGuess = wall - zoneOffsetMs(new Date(wall), timeZone);
  const corrected = wall - zoneOffsetMs(new Date(firstGuess), timeZone);
  return new Date(corrected);
}

/** UTC instant -> `YYYY-MM-DDTHH:mm` wall clock in `timeZone` (for datetime-local defaults). */
export function toZonedLocalInput(instant: Date, timeZone: string): string {
  const shifted = new Date(instant.getTime() + zoneOffsetMs(instant, timeZone));
  return shifted.toISOString().slice(0, 16);
}
