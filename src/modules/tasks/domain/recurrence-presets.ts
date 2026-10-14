/**
 * Maps UI recurrence presets to RFC 5545 RRULE strings.
 */

export type RecurrencePreset = 'none' | 'daily' | 'weekly' | 'weekdays' | 'monthly' | 'custom';

const WEEKDAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const;

const WEEKDAY_SHORT_TO_INDEX: Record<string, number> = {
  Sun: 0,
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
};

export function weekdayCodeForDate(date: Date, timeZone?: string): string {
  if (timeZone) {
    const weekday = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' }).format(date);
    const index = WEEKDAY_SHORT_TO_INDEX[weekday];
    if (index != null) return WEEKDAY_CODES[index] ?? 'MO';
  }
  return WEEKDAY_CODES[date.getUTCDay()] ?? 'MO';
}

export function buildRruleFromPreset(
  preset: Exclude<RecurrencePreset, 'none'>,
  options: { interval?: number; weekday?: string; startsAt: Date; timeZone?: string },
): string {
  const interval = Math.max(1, Math.min(options.interval ?? 1, 365));
  const timeZone = options.timeZone;

  switch (preset) {
    case 'daily':
      return interval === 1 ? 'FREQ=DAILY' : `FREQ=DAILY;INTERVAL=${interval}`;
    case 'weekly': {
      const day = options.weekday ?? weekdayCodeForDate(options.startsAt, timeZone);
      return interval === 1
        ? `FREQ=WEEKLY;BYDAY=${day}`
        : `FREQ=WEEKLY;INTERVAL=${interval};BYDAY=${day}`;
    }
    case 'weekdays':
      return 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR';
    case 'monthly':
      return interval === 1 ? 'FREQ=MONTHLY' : `FREQ=MONTHLY;INTERVAL=${interval}`;
    case 'custom':
      return `FREQ=DAILY;INTERVAL=${interval}`;
    default:
      return 'FREQ=DAILY';
  }
}

export function detectPresetFromRrule(rrule: string): {
  preset: RecurrencePreset;
  interval: number;
  weekday: string | null;
} {
  const parts = Object.fromEntries(
    rrule.split(';').map((segment) => {
      const [key, value] = segment.split('=');
      return [key ?? '', value ?? ''];
    }),
  );

  const freq = parts.FREQ ?? '';
  const interval = Number.parseInt(parts.INTERVAL ?? '1', 10) || 1;
  const byday = parts.BYDAY ?? null;

  if (freq === 'DAILY' && interval === 1) {
    return { preset: 'daily', interval: 1, weekday: null };
  }
  if (freq === 'DAILY' && interval > 1) {
    return { preset: 'custom', interval, weekday: null };
  }
  if (freq === 'WEEKLY' && byday === 'MO,TU,WE,TH,FR') {
    return { preset: 'weekdays', interval: 1, weekday: null };
  }
  if (freq === 'WEEKLY') {
    return { preset: 'weekly', interval, weekday: byday?.split(',')[0] ?? null };
  }
  if (freq === 'MONTHLY') {
    return { preset: 'monthly', interval, weekday: null };
  }

  return { preset: 'custom', interval, weekday: byday };
}
