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

/**
 * Expands a recurrence rule into occurrence timestamps between `from` and `to`.
 *
 * Returns only occurrences that fall within [from, to).
 * Respects maxOccurrences and endsAt from the rule.
 *
 * Requires the `rrule` package at runtime. Uses dynamic import to avoid bundling.
 */
export async function expandOccurrences(
  rule: TaskRecurrenceRule,
  from: Date,
  to: Date,
): Promise<OccurrenceSlot[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rruleModule = await import('rrule' as any).catch(() => null);
  if (!rruleModule) {
    throw new Error(
      'rrule package is required for recurrence expansion. Install it with: npm install rrule',
    );
  }

  const { RRule } = rruleModule as { RRule: { fromString: (s: string) => { between: (a: Date, b: Date, inc: boolean) => Date[] } } };
  const rrule = RRule.fromString(rule.rrule);

  const effectiveStart = rule.startsAt > from ? rule.startsAt : from;
  const effectiveEnd = rule.endsAt && rule.endsAt < to ? rule.endsAt : to;

  const dates = rrule.between(effectiveStart, effectiveEnd, true);

  // Respect maxOccurrences
  const limited = rule.maxOccurrences != null ? dates.slice(0, rule.maxOccurrences) : dates;

  return limited.map((d: Date) => ({
    ruleId: rule.id,
    occurrenceAt: d,
  }));
}

/**
 * Returns the next N occurrences from `after` for a recurrence rule.
 * Requires the `rrule` package at runtime.
 */
export async function generateNextOccurrences(
  rule: TaskRecurrenceRule,
  after: Date,
  count: number,
): Promise<OccurrenceSlot[]> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rruleModule = await import('rrule' as any).catch(() => null);
  if (!rruleModule) {
    throw new Error(
      'rrule package is required for recurrence expansion. Install it with: npm install rrule',
    );
  }

  const { RRule } = rruleModule as { RRule: { fromString: (s: string) => { after: (d: Date, inc: boolean) => Date | null } } };
  const rrule = RRule.fromString(rule.rrule);
  const first = rrule.after(after, false);
  if (!first) return [];

  const results: OccurrenceSlot[] = [];
  let current: Date | null = first;

  for (let i = 0; i < count && current !== null; i++) {
    if (rule.endsAt && current > rule.endsAt) break;
    if (rule.maxOccurrences != null && i >= rule.maxOccurrences) break;
    results.push({ ruleId: rule.id, occurrenceAt: current });
    current = rrule.after(current, false);
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
