const JERUSALEM = 'Asia/Jerusalem';

/** Hour 0-23 in Asia/Jerusalem, including daylight-saving transitions. */
export function jerusalemHour(date: Date): number {
  const hour = new Intl.DateTimeFormat('en-GB', {
    timeZone: JERUSALEM,
    hour: '2-digit',
    hourCycle: 'h23',
  }).format(date);
  return Number(hour);
}

export function jerusalemDateKey(date: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: JERUSALEM,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
  return parts;
}

/** A new reset run opens only at 03:00 Asia/Jerusalem. */
export function isJerusalemResetHour(date: Date): boolean {
  return jerusalemHour(date) === 3;
}
