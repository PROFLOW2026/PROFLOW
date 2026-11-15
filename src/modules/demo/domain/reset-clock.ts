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

/**
 * Hobby allows one cron per day. `0 1 * * *` is 03:00 Asia/Jerusalem in standard
 * time and 04:00 during daylight saving, so both hours open the nightly run.
 */
export function isJerusalemResetHour(date: Date): boolean {
  const hour = jerusalemHour(date);
  return hour === 3 || hour === 4;
}
