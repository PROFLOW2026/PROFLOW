import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { resolveAttendanceDayState } from '@/modules/workforce/domain/employment-active-range';
import { adjustMonthlyCompensationForUnpaidAbsence } from '@/modules/workforce/domain/employment-active-range';
import { distinctYearMonthsFromWorkDates, mergeYearMonths } from '@/modules/workforce/application/attendance-outcomes';

const openEmployment = { hireDate: null, endDate: null };

describe('missing attendance vs explicit outcomes', () => {
  it('treats unpaid leave as a complete report — not missing', () => {
    const state = resolveAttendanceDayState({
      workDate: businessDate('2026-08-05'),
      employment: openEmployment,
      outcome: {
        outcome: 'not_worked',
        absenceCompensation: 'unpaid',
      },
    });
    expect(state).toBe('not_worked_unpaid');
    expect(state).not.toBe('missing');
  });

  it('still flags truly missing days without attendance or outcome', () => {
    const state = resolveAttendanceDayState({
      workDate: businessDate('2026-08-05'),
      employment: openEmployment,
      outcome: null,
    });
    expect(state).toBe('missing');
  });

  it('treats explicit vacation + unpaid as complete report — not missing', () => {
    const state = resolveAttendanceDayState({
      workDate: businessDate('2026-03-05'),
      employment: openEmployment,
      outcome: {
        outcome: 'not_worked',
        absenceCompensation: 'unpaid',
      },
    });
    expect(state).toBe('not_worked_unpaid');
    expect(state).not.toBe('missing');
  });
});

describe('historical attendance outcome months', () => {
  it('dedupes and sorts year-months from outcome work dates', () => {
    expect(
      distinctYearMonthsFromWorkDates([
        '2026-04-03',
        '2026-03-01',
        '2026-03-16',
        '2026-04-01',
      ]),
    ).toEqual(['2026-03', '2026-04']);
  });

  it('merges save-range months without historical expansion', () => {
    expect(
      mergeYearMonths(['2026-03', '2026-04'], ['2026-04']),
    ).toEqual(['2026-03', '2026-04']);
  });

  it('full-month unpaid → zero recognized salary', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: '8250',
        relevantWorkDays: 22,
        unpaidAbsenceDays: 22,
      }),
    ).toBe('0.000000');
  });

  it('partial-month unpaid → prorated recognized salary (March-style)', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: '9750',
        relevantWorkDays: 23,
        unpaidAbsenceDays: 16,
      }),
    ).toBe('2967.391304');
  });

  it('month without explicit outcomes leaves base amount unchanged', () => {
    expect(
      adjustMonthlyCompensationForUnpaidAbsence({
        baseAmount: '8250',
        relevantWorkDays: 22,
        unpaidAbsenceDays: 0,
      }),
    ).toBe('8250');
  });
});
