import { describe, expect, it } from 'vitest';
import {
  DateError,
  addDays,
  businessDate,
  daysBetween,
  endOfMonth,
  endOfWeek,
  isEffectiveOn,
  normalizeWorkWeekStartDay,
  rangesOverlap,
  selectEffective,
  startOfWeek,
  todayInTimeZone,
  type BusinessDate,
  type EffectiveRange,
} from '@/shared/dates/dates';

const date = (value: string) => businessDate(value);

describe('business dates', () => {
  it('rejects a calendar day that does not exist', () => {
    expect(() => businessDate('2026-02-30')).toThrow(DateError);
    expect(() => businessDate('2026-13-01')).toThrow(DateError);
    expect(() => businessDate('09/08/2026')).toThrow(DateError);
  });

  it('crosses month and leap-year boundaries', () => {
    expect(addDays(date('2026-01-31'), 1)).toBe('2026-02-01');
    expect(addDays(date('2024-02-28'), 1)).toBe('2024-02-29');
    expect(daysBetween(date('2026-01-01'), date('2026-12-31'))).toBe(364);
    expect(endOfMonth(date('2026-02-10'))).toBe('2026-02-28');
  });

  it('resolves today in the organisation time zone, not the server one', () => {
    // 22:30 UTC is already the next day in Jerusalem.
    const instant = new Date('2026-08-09T22:30:00Z');
    expect(todayInTimeZone('Asia/Jerusalem', instant)).toBe('2026-08-10');
    expect(todayInTimeZone('America/New_York', instant)).toBe('2026-08-09');
  });
});

describe('effective-dated ranges', () => {
  const closed: EffectiveRange = { validFrom: date('2026-01-01'), validTo: date('2026-06-30') };
  const open: EffectiveRange = { validFrom: date('2026-07-01'), validTo: null };

  it('treats both range ends as inclusive', () => {
    expect(isEffectiveOn(closed, date('2026-01-01'))).toBe(true);
    expect(isEffectiveOn(closed, date('2026-06-30'))).toBe(true);
    expect(isEffectiveOn(closed, date('2025-12-31'))).toBe(false);
    expect(isEffectiveOn(closed, date('2026-07-01'))).toBe(false);
  });

  it('treats a null end as still in force', () => {
    expect(isEffectiveOn(open, date('2099-01-01'))).toBe(true);
  });

  it('detects overlapping versions, which a rate history must never contain', () => {
    expect(rangesOverlap(closed, open)).toBe(false);
    expect(
      rangesOverlap(closed, { validFrom: date('2026-06-30'), validTo: null }),
    ).toBe(true);
  });
});

describe('selectEffective', () => {
  interface Rate extends EffectiveRange {
    hourly: string;
  }

  const rates: Rate[] = [
    { hourly: '80', validFrom: date('2026-01-01'), validTo: date('2026-06-30') },
    { hourly: '95', validFrom: date('2026-07-01'), validTo: null },
  ];

  it('picks the version in force on the day, not the newest row', () => {
    expect(selectEffective(rates, date('2026-03-15'))?.hourly).toBe('80');
    expect(selectEffective(rates, date('2026-08-09'))?.hourly).toBe('95');
  });

  it('returns null when a gap leaves no version in force', () => {
    const gapped: Rate[] = [{ hourly: '80', validFrom: date('2026-05-01'), validTo: date('2026-05-31') }];
    expect(selectEffective(gapped, date('2026-04-30'))).toBeNull();
    expect(selectEffective(gapped, date('2026-06-01'))).toBeNull();
  });

  it('prefers the later start when two versions both apply', () => {
    const overlapping: Rate[] = [
      { hourly: '80', validFrom: date('2026-01-01'), validTo: null },
      { hourly: '95', validFrom: date('2026-07-01'), validTo: null },
    ];
    expect(selectEffective(overlapping, date('2026-08-09'))?.hourly).toBe('95');
  });
});

describe('business date type guard', () => {
  it('accepts a Date instance and narrows it to a calendar day', () => {
    const value: BusinessDate = businessDate(new Date('2026-08-09T21:15:00Z'));
    expect(value).toBe('2026-08-09');
  });
});

describe('work week boundaries', () => {
  it('defaults invalid week starts to Sunday', () => {
    expect(normalizeWorkWeekStartDay(undefined)).toBe(0);
    expect(normalizeWorkWeekStartDay(9)).toBe(0);
    expect(normalizeWorkWeekStartDay(1)).toBe(1);
  });

  it('uses Sunday start by default and Monday when configured', () => {
    expect(startOfWeek(date('2026-08-12'))).toBe('2026-08-09');
    expect(endOfWeek(date('2026-08-12'))).toBe('2026-08-15');
    expect(startOfWeek(date('2026-08-12'), 1)).toBe('2026-08-10');
    expect(endOfWeek(date('2026-08-12'), 1)).toBe('2026-08-16');
  });
});
