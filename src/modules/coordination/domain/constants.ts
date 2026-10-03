/**
 * Client-safe copies of the coordination enums (TSX must not import the Drizzle schema).
 * `tests/unit/coordination/constants.test.ts` keeps them identical to drizzle/schema/dg-coordination.ts.
 */
export const EVENT_KINDS = [
  'concrete_pour',
  'installation',
  'inspection',
  'delivery',
  'handover',
  'testing',
  'meeting',
  'other',
] as const;

export const RESPONSE_STATUSES = ['ready', 'not_ready', 'ready_with_conditions', 'acknowledged', 'blocked'] as const;

export const NOTE_REQUIRED_STATUSES = ['not_ready', 'ready_with_conditions', 'blocked'] as const;

export const TASK_PRIORITIES = ['low', 'medium', 'high', 'urgent'] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

/** [from, to) window around now for calendar sources. */
export function calendarWindow(daysBack: number, daysAhead: number, now: Date = new Date()): { from: Date; to: Date } {
  return { from: new Date(now.getTime() - daysBack * DAY_MS), to: new Date(now.getTime() + daysAhead * DAY_MS) };
}
