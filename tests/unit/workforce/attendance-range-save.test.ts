/**
 * Generic historical range save → proration contract (no employee/month fixtures).
 */
import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import {
  filterEligibleWorkDatesInRange,
  enumerateBusinessDates,
} from '@/modules/workforce/application/attendance-outcomes';
import { adjustMonthlyCompensationForUnpaidAbsence } from '@/modules/workforce/domain/employment-active-range';

const SUN_THU = [0, 1, 2, 3, 4] as const;
const openEmployment = { hireDate: null, endDate: null };

describe('historical range save — eligible workdays only', () => {
  it('Apr 1–9 range yields 7 Sun–Thu workdays, not 9 calendar days', () => {
    const dates = filterEligibleWorkDatesInRange({
      fromDate: businessDate('2026-04-01'),
      toDate: businessDate('2026-04-09'),
      workWeekdays: SUN_THU,
      employment: openEmployment,
    });
    expect(dates).toEqual([
      '2026-04-01',
      '2026-04-02',
      '2026-04-05',
      '2026-04-06',
      '2026-04-07',
      '2026-04-08',
      '2026-04-09',
    ]);
    expect(enumerateBusinessDates(businessDate('2026-04-01'), businessDate('2026-04-09'))).toHaveLength(9);
  });

  it('cross-month range Mar 28 → May 2 includes eligible days from each month', () => {
    const dates = filterEligibleWorkDatesInRange({
      fromDate: businessDate('2026-03-28'),
      toDate: businessDate('2026-05-02'),
      workWeekdays: SUN_THU,
      employment: openEmployment,
    });
    expect(dates[0]).toBe('2026-03-29');
    expect(dates.at(-1)).toBe('2026-04-30'); // May 2 is Sat — excluded
    expect(dates.every((d) => !d.endsWith('-03-28'))).toBe(true); // Sat excluded
  });
});

describe('stored unpaid workdays → April proration', () => {
  const aprilWorkdays = 22;
  const base = '8250';

  it('7 unpaid eligible days in range → recognized 5625, not full 8250', () => {
    const unpaidInRange = 7;
    const recognized = adjustMonthlyCompensationForUnpaidAbsence({
      baseAmount: base,
      relevantWorkDays: aprilWorkdays,
      unpaidAbsenceDays: unpaidInRange,
    });
    expect(recognized).toBe('5625.000000');
    expect(recognized).not.toBe(base);
  });

  it('paid absence days do not reduce recognized salary', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: base,
        relevantWorkDays: aprilWorkdays,
        unpaidAbsenceDays: 0,
      }),
    ).toBe(base);
  });
});
