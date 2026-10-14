/**
 * Recurrence domain logic.
 *
 * Expands RFC 5545 RRULE occurrences and checks idempotency.
 * DST-aware: all computations in rule timezone.
 *
 * NOTE: expandOccurrences and generateNextOccurrences require the `rrule` npm package.
 * Install with: npm install rrule
 * These functions are invoked only from server-side background jobs.
 */

import type { TaskRecurrenceRule, TaskRecurrenceOccurrence } from './types';

export interface OccurrenceSlot {
  readonly ruleId: string;
  readonly occurrenceAt: Date;
}

type RRuleInstance = {
  between: (a: Date, b: Date, inc: boolean) => Date[];
  after: (d: Date, inc: boolean) => Date | null;
};

type RRuleModule = {
  rrulestr: (value: string) => RRuleInstance;
};

async function loadRRuleModule(): Promise<RRuleModule> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const imported = await import('rrule' as any).catch(() => null);
  const bundle = imported?.default ?? imported;
  if (!bundle?.rrulestr) {
    throw new Error(
      'rrule package is required for recurrence expansion. Install it with: npm install rrule',
    );
  }
  return { rrulestr: bundle.rrulestr as RRuleModule['rrulestr'] };
}

function formatDtstartInZone(date: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(date);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '00';
  return `${get('year')}${get('month')}${get('day')}T${get('hour')}${get('minute')}${get('second')}`;
}

function buildRuleInstance(module: RRuleModule, rule: TaskRecurrenceRule): RRuleInstance {
  const dtstart = formatDtstartInZone(rule.startsAt, rule.timezone);
  const rruleBody = rule.rrule.startsWith('RRULE:') ? rule.rrule : `RRULE:${rule.rrule}`;
  return module.rrulestr(`DTSTART;TZID=${rule.timezone}:${dtstart}\n${rruleBody}`);
}

function localClockParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(instant);
  const get = (type: string) => Number.parseInt(parts.find((part) => part.type === type)?.value ?? '0', 10);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour'),
    minute: get('minute'),
    second: get('second'),
  };
}

function anchorLocalClockFromStartsAt(startsAt: Date, timeZone: string) {
  const parts = localClockParts(startsAt, timeZone);
  return { hour: parts.hour, minute: parts.minute, second: parts.second };
}

function getTimezoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = localClockParts(instant, timeZone);
  const wallAsUtcMs = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour,
    parts.minute,
    parts.second,
  );
  return wallAsUtcMs - instant.getTime();
}

function wallClockInTimeZoneToInstant(
  wall: {
    readonly year: number;
    readonly month: number;
    readonly day: number;
    readonly hour: number;
    readonly minute: number;
    readonly second: number;
  },
  timeZone: string,
): Date {
  const wallAsUtcMs = Date.UTC(
    wall.year,
    wall.month - 1,
    wall.day,
    wall.hour,
    wall.minute,
    wall.second,
  );
  let utcMs = wallAsUtcMs - getTimezoneOffsetMs(new Date(wallAsUtcMs), timeZone);
  for (let attempt = 0; attempt < 4; attempt++) {
    const next = wallAsUtcMs - getTimezoneOffsetMs(new Date(utcMs), timeZone);
    if (next === utcMs) {
      return new Date(utcMs);
    }
    utcMs = next;
  }
  return new Date(utcMs);
}

/**
 * rrule + TZID: on UTC hosts `Date` values are real instants; on local-TZ hosts
 * UTC fields encode wall-clock in the rule zone. Pick the interpretation that
 * matches the anchored local time from `startsAt`.
 */
function normalizeOccurrenceInstant(raw: Date, rule: TaskRecurrenceRule): Date {
  const anchor = anchorLocalClockFromStartsAt(rule.startsAt, rule.timezone);
  const observed = localClockParts(raw, rule.timezone);
  if (
    observed.hour === anchor.hour &&
    observed.minute === anchor.minute &&
    observed.second === anchor.second
  ) {
    return new Date(raw.getTime());
  }
  return wallClockInTimeZoneToInstant(
    {
      year: raw.getUTCFullYear(),
      month: raw.getUTCMonth() + 1,
      day: raw.getUTCDate(),
      hour: raw.getUTCHours(),
      minute: raw.getUTCMinutes(),
      second: raw.getUTCSeconds(),
    },
    rule.timezone,
  );
}

export interface ExpandOccurrencesOptions {
  readonly remainingOccurrences?: number | null;
}

/**
 * Expands a recurrence rule into occurrence timestamps between `from` and `to`.
 *
 * Returns only occurrences that fall within [from, to).
 * Respects maxOccurrences (via remainingOccurrences) and endsAt from the rule.
 */
export async function expandOccurrences(
  rule: TaskRecurrenceRule,
  from: Date,
  to: Date,
  options: ExpandOccurrencesOptions = {},
): Promise<OccurrenceSlot[]> {
  const rruleModule = await loadRRuleModule();
  const rrule = buildRuleInstance(rruleModule, rule);

  const effectiveStart = rule.startsAt > from ? rule.startsAt : from;
  const effectiveEnd = rule.endsAt && rule.endsAt < to ? rule.endsAt : to;

  const dates = rrule.between(effectiveStart, effectiveEnd, true);

  const cap =
    options.remainingOccurrences != null
      ? Math.min(options.remainingOccurrences, dates.length)
      : rule.maxOccurrences != null
        ? Math.min(rule.maxOccurrences, dates.length)
        : dates.length;

  return dates.slice(0, cap).map((d: Date) => ({
    ruleId: rule.id,
    occurrenceAt: normalizeOccurrenceInstant(d, rule),
  }));
}

/**
 * Returns the next N occurrences from `after` for a recurrence rule.
 */
export async function generateNextOccurrences(
  rule: TaskRecurrenceRule,
  after: Date,
  count: number,
): Promise<OccurrenceSlot[]> {
  const rruleModule = await loadRRuleModule();
  const rrule = buildRuleInstance(rruleModule, rule);
  let cursorRaw: Date | null = after;
  const results: OccurrenceSlot[] = [];
  const globalCap = rule.maxOccurrences ?? count;

  while (results.length < count && results.length < globalCap) {
    const nextRaw = rrule.after(cursorRaw, false);
    if (!nextRaw) break;
    const occurrenceAt = normalizeOccurrenceInstant(nextRaw, rule);
    if (rule.endsAt && occurrenceAt > rule.endsAt) break;
    results.push({ ruleId: rule.id, occurrenceAt });
    cursorRaw = nextRaw;
  }

  return results;
}

/**
 * Returns true when an occurrence at `occurrenceAt` already exists in the provided set.
 * Used to enforce idempotency before inserting into task_recurrence_occurrences.
 * (The DB UNIQUE constraint is the authoritative guard; this is a fast pre-check.)
 */
export function isIdempotentOccurrence(
  existingOccurrences: readonly Pick<TaskRecurrenceOccurrence, 'ruleId' | 'occurrenceAt'>[],
  ruleId: string,
  occurrenceAt: Date,
): boolean {
  return existingOccurrences.some(
    (o) =>
      o.ruleId === ruleId &&
      o.occurrenceAt.getTime() === occurrenceAt.getTime(),
  );
}
