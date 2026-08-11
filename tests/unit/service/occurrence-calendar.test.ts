import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import {
  advanceOccurrenceDate,
  computeNextOccurrenceDate,
  enumerateOccurrenceDates,
} from '@/modules/service/recurrence/domain/occurrence-calendar';

describe('advanceOccurrenceDate', () => {
  it('advances daily by interval', () => {
    expect(advanceOccurrenceDate(businessDate('2026-03-01'), 'daily', 1)).toBe('2026-03-02');
    expect(advanceOccurrenceDate(businessDate('2026-03-01'), 'daily', 3)).toBe('2026-03-04');
  });

  it('advances weekly by 7 × interval days', () => {
    expect(advanceOccurrenceDate(businessDate('2026-03-01'), 'weekly', 1)).toBe('2026-03-08');
    expect(advanceOccurrenceDate(businessDate('2026-03-01'), 'weekly', 2)).toBe('2026-03-15');
  });

  it('clamps monthly day-of-month (Jan 31 → Feb 28)', () => {
    expect(advanceOccurrenceDate(businessDate('2026-01-31'), 'monthly', 1)).toBe('2026-02-28');
  });

  it('advances quarterly by 3 months', () => {
    expect(advanceOccurrenceDate(businessDate('2026-01-15'), 'quarterly', 1)).toBe('2026-04-15');
  });

  it('advances yearly by 12 months and clamps leap day', () => {
    expect(advanceOccurrenceDate(businessDate('2024-02-29'), 'yearly', 1)).toBe('2025-02-28');
  });

  it('treats invalid interval as 1', () => {
    expect(advanceOccurrenceDate(businessDate('2026-03-01'), 'weekly', 0)).toBe('2026-03-08');
    expect(advanceOccurrenceDate(businessDate('2026-03-01'), 'weekly', null)).toBe('2026-03-08');
  });
});

describe('enumerateOccurrenceDates', () => {
  it('emits weekly dates inclusive of start through until', () => {
    const dates = enumerateOccurrenceDates({
      startDate: '2026-01-05',
      frequency: 'weekly',
      intervalCount: 1,
      untilInclusive: '2026-01-26',
    });
    expect(dates).toEqual(['2026-01-05', '2026-01-12', '2026-01-19', '2026-01-26']);
  });

  it('respects series endDate earlier than horizon', () => {
    const dates = enumerateOccurrenceDates({
      startDate: '2026-01-01',
      endDate: '2026-01-15',
      frequency: 'weekly',
      untilInclusive: '2026-03-01',
    });
    expect(dates).toEqual(['2026-01-01', '2026-01-08', '2026-01-15']);
  });

  it('skips dates on or before afterExclusive', () => {
    const dates = enumerateOccurrenceDates({
      startDate: '2026-01-01',
      frequency: 'monthly',
      untilInclusive: '2026-06-01',
      afterExclusive: '2026-02-01',
    });
    expect(dates).toEqual(['2026-03-01', '2026-04-01', '2026-05-01', '2026-06-01']);
  });

  it('returns empty when start is after until', () => {
    expect(
      enumerateOccurrenceDates({
        startDate: '2026-06-01',
        frequency: 'daily',
        untilInclusive: '2026-05-01',
      }),
    ).toEqual([]);
  });

  it('caps with maxCount', () => {
    const dates = enumerateOccurrenceDates({
      startDate: '2026-01-01',
      frequency: 'daily',
      untilInclusive: '2026-12-31',
      maxCount: 5,
    });
    expect(dates).toHaveLength(5);
    expect(dates[0]).toBe('2026-01-01');
    expect(dates[4]).toBe('2026-01-05');
  });
});

describe('computeNextOccurrenceDate', () => {
  it('returns start when onOrAfter is on or before start', () => {
    expect(
      computeNextOccurrenceDate({
        startDate: '2026-03-10',
        frequency: 'weekly',
        onOrAfter: '2026-03-01',
      }),
    ).toBe('2026-03-10');
  });

  it('returns the next series date on or after the cursor', () => {
    expect(
      computeNextOccurrenceDate({
        startDate: '2026-03-01',
        frequency: 'weekly',
        onOrAfter: '2026-03-09',
      }),
    ).toBe('2026-03-15');
  });

  it('returns null when past endDate', () => {
    expect(
      computeNextOccurrenceDate({
        startDate: '2026-01-01',
        endDate: '2026-01-31',
        frequency: 'monthly',
        onOrAfter: '2026-02-01',
      }),
    ).toBeNull();
  });
});
