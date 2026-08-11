/**
 * Pure calendar math for recurring financial DRAFT templates.
 * Framework-free — unit-tested without DB.
 */

import {
  addDays,
  addMonths,
  businessDate,
  compareBusinessDates,
  type BusinessDate,
} from '@/shared/dates';
import { DomainRuleError } from '@/shared/errors';
import type { DraftFrequency, DraftStatus } from './types';

function normalizeInterval(intervalCount: number | null | undefined): number {
  if (intervalCount == null || !Number.isFinite(intervalCount)) return 1;
  const n = Math.trunc(intervalCount);
  return n < 1 ? 1 : n;
}

/**
 * Advances one generation by frequency × interval.
 * Monthly/quarterly/yearly clamp day-of-month (e.g. Jan 31 → Feb 28).
 */
export function advanceDraftRunDate(
  date: BusinessDate,
  frequency: DraftFrequency,
  intervalCount: number | null | undefined = 1,
): BusinessDate {
  const n = normalizeInterval(intervalCount);
  switch (frequency) {
    case 'weekly':
      return addDays(date, 7 * n);
    case 'monthly':
      return addMonths(date, n);
    case 'quarterly':
      return addMonths(date, 3 * n);
    case 'yearly':
      return addMonths(date, 12 * n);
    default: {
      const _exhaustive: never = frequency;
      return _exhaustive;
    }
  }
}

export interface BumpScheduleInput {
  readonly currentNextRunDate: string;
  readonly runDate: string;
  readonly frequency: DraftFrequency;
  readonly intervalCount: number;
  readonly endDate?: string | null;
}

export interface BumpScheduleResult {
  readonly nextRunDate: BusinessDate;
  readonly status: DraftStatus;
}

/**
 * After a successful generate-now: advance from the later of scheduled next
 * and the run date so an overdue template does not stay stuck in the past.
 *
 * CHECK recurring_financial_drafts_date_range requires end_date >= next_run_date.
 * If the computed next would pass the end date, the template ends and next_run_date
 * is clamped to end_date.
 */
export function bumpScheduleAfterGenerate(input: BumpScheduleInput): BumpScheduleResult {
  const currentNext = businessDate(input.currentNextRunDate);
  const runDate = businessDate(input.runDate);
  const from = compareBusinessDates(currentNext, runDate) >= 0 ? currentNext : runDate;
  const next = advanceDraftRunDate(from, input.frequency, input.intervalCount);

  if (!input.endDate) {
    return { nextRunDate: next, status: 'active' };
  }

  const end = businessDate(input.endDate);
  if (compareBusinessDates(next, end) > 0) {
    return { nextRunDate: end, status: 'ended' };
  }
  return { nextRunDate: next, status: 'active' };
}

export function assertScheduleRange(nextRunDate: string, endDate: string | null | undefined): void {
  if (!endDate) return;
  if (compareBusinessDates(businessDate(endDate), businessDate(nextRunDate)) < 0) {
    throw new DomainRuleError(
      'End date cannot be before the next generation date',
      'recurringDrafts.errors.endBeforeNext',
    );
  }
}
