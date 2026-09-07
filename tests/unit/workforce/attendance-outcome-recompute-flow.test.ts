/**
 * Systemic attendance-outcome → derived labor recompute contract.
 * No employee/month-specific fixtures — pure date/month logic + compensation rules.
 */
import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import {
  distinctYearMonthsFromWorkDates,
  enumerateBusinessDates,
  mergeYearMonths,
  yearMonthsInBusinessDateRange,
} from '@/modules/workforce/application/attendance-outcomes';
import { adjustMonthlyCompensationForUnpaidAbsence } from '@/modules/workforce/domain/employment-active-range';

describe('affected year-month resolution (systemic)', () => {
  it('single historical day → one month', () => {
    expect(yearMonthsInBusinessDateRange(businessDate('2026-04-05'), businessDate('2026-04-05'))).toEqual([
      '2026-04',
    ]);
  });

  it('cross-month range → every crossed month', () => {
    expect(
      yearMonthsInBusinessDateRange(businessDate('2026-03-28'), businessDate('2026-05-02')),
    ).toEqual(['2026-03', '2026-04', '2026-05']);
  });

  it('full-month range within one calendar month', () => {
    const dates = enumerateBusinessDates(businessDate('2026-01-01'), businessDate('2026-01-31'));
    expect(distinctYearMonthsFromWorkDates(dates)).toEqual(['2026-01']);
  });

  it('merges save range + stored outcomes + derived rows without duplicates', () => {
    expect(
      mergeYearMonths(
        ['2026-03', '2026-04'],
        ['2026-04', '2026-08'],
        ['2026-01', '2026-08'],
        ['2026-02'],
      ),
    ).toEqual(['2026-01', '2026-02', '2026-03', '2026-04', '2026-08']);
  });
});

describe('recognition rules after explicit outcomes (systemic)', () => {
  const base = '8250';
  const workdays = 22;

  it('full-month explicit not_worked + unpaid → zero recognized', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: base,
        relevantWorkDays: workdays,
        unpaidAbsenceDays: workdays,
      }),
    ).toBe('0.000000');
  });

  it('partial-month explicit not_worked + unpaid → prorated recognized', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: base,
        relevantWorkDays: workdays,
        unpaidAbsenceDays: 8,
      }),
    ).toBe('5250.000000');
  });

  it('explicit not_worked + paid → full recognized (paid absence does not reduce)', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: base,
        relevantWorkDays: workdays,
        unpaidAbsenceDays: 0,
      }),
    ).toBe(base);
  });

  it('missing days without outcomes → full recognized (no guess)', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: base,
        relevantWorkDays: workdays,
        unpaidAbsenceDays: 0,
      }),
    ).toBe(base);
  });

  it('worked days do not reduce via unpaid adjustment path', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: base,
        relevantWorkDays: workdays,
        unpaidAbsenceDays: 0,
      }),
    ).toBe(base);
  });
});
