import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { DomainRuleError } from '@/shared/errors';
import {
  advanceDraftRunDate,
  assertScheduleRange,
  bumpScheduleAfterGenerate,
} from '@/modules/recurring-drafts/domain/schedule';

describe('advanceDraftRunDate', () => {
  it('advances weekly by 7 × interval days', () => {
    expect(advanceDraftRunDate(businessDate('2026-03-01'), 'weekly', 1)).toBe('2026-03-08');
    expect(advanceDraftRunDate(businessDate('2026-03-01'), 'weekly', 2)).toBe('2026-03-15');
  });

  it('clamps monthly day-of-month (Jan 31 → Feb 28)', () => {
    expect(advanceDraftRunDate(businessDate('2026-01-31'), 'monthly', 1)).toBe('2026-02-28');
  });

  it('advances quarterly by 3 months', () => {
    expect(advanceDraftRunDate(businessDate('2026-01-15'), 'quarterly', 1)).toBe('2026-04-15');
  });

  it('advances yearly by 12 months', () => {
    expect(advanceDraftRunDate(businessDate('2024-02-29'), 'yearly', 1)).toBe('2025-02-28');
  });
});

describe('bumpScheduleAfterGenerate', () => {
  it('advances from the scheduled next when it is still ahead', () => {
    const result = bumpScheduleAfterGenerate({
      currentNextRunDate: '2026-06-01',
      runDate: '2026-05-15',
      frequency: 'monthly',
      intervalCount: 1,
    });
    expect(result).toEqual({ nextRunDate: '2026-07-01', status: 'active' });
  });

  it('advances from the run date when the template is overdue', () => {
    const result = bumpScheduleAfterGenerate({
      currentNextRunDate: '2026-01-01',
      runDate: '2026-03-10',
      frequency: 'monthly',
      intervalCount: 1,
    });
    expect(result).toEqual({ nextRunDate: '2026-04-10', status: 'active' });
  });

  it('ends and clamps nextRunDate when the next date would pass endDate', () => {
    const result = bumpScheduleAfterGenerate({
      currentNextRunDate: '2026-06-01',
      runDate: '2026-06-01',
      frequency: 'monthly',
      intervalCount: 1,
      endDate: '2026-06-15',
    });
    expect(result).toEqual({ nextRunDate: '2026-06-15', status: 'ended' });
  });
});

describe('assertScheduleRange', () => {
  it('rejects an end date before next generation', () => {
    expect(() => assertScheduleRange('2026-06-01', '2026-05-01')).toThrow(DomainRuleError);
  });
});
