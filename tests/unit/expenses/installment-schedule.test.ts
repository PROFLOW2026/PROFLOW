import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import {
  assertInstallmentScheduleConserves,
  buildEqualInstallmentSchedule,
  recognizedInstallmentToDate,
  remainingInstallmentAfter,
  yearMonthFromBusinessDate,
} from '@/modules/expenses/domain/installment-schedule';

describe('managerial installment schedule', () => {
  it('splits 10000 into 3 months with residue on the last line and conserves NET', () => {
    const total = money('10000', 'ILS');
    const schedule = buildEqualInstallmentSchedule({
      totalNet: total,
      installmentCount: 3,
      startYearMonth: '2026-01',
    });

    expect(schedule.lines).toHaveLength(3);
    expect(schedule.lines.map((line) => line.yearMonth)).toEqual(['2026-01', '2026-02', '2026-03']);
    expect(schedule.lines[0]?.amount.amount).toBe('3333.330000');
    expect(schedule.lines[1]?.amount.amount).toBe('3333.330000');
    expect(schedule.lines[2]?.amount.amount).toBe('3333.340000');
    expect(toNumericString(schedule.total)).toBe(toNumericString(total));
    assertInstallmentScheduleConserves(schedule, total);
  });

  it('retro start date still conserves and recognizes past months to date', () => {
    const total = money('10000', 'ILS');
    const startYearMonth = yearMonthFromBusinessDate('2025-11-15');
    expect(startYearMonth).toBe('2025-11');

    const schedule = buildEqualInstallmentSchedule({
      totalNet: total,
      installmentCount: 3,
      startYearMonth,
    });

    expect(schedule.lines.map((line) => line.yearMonth)).toEqual(['2025-11', '2025-12', '2026-01']);
    assertInstallmentScheduleConserves(schedule, total);
    expect(toNumericString(recognizedInstallmentToDate(schedule, '2025-12'))).toBe('6666.660000');
    expect(toNumericString(remainingInstallmentAfter(schedule, '2025-12'))).toBe('3333.340000');
    expect(toNumericString(recognizedInstallmentToDate(schedule, '2025-10'))).toBe('0.000000');
  });

  it('count 1 is a single line in the start month', () => {
    const total = money('2500', 'ILS');
    const schedule = buildEqualInstallmentSchedule({
      totalNet: total,
      installmentCount: 1,
      startYearMonth: '2026-08',
    });
    expect(schedule.lines).toHaveLength(1);
    expect(schedule.lines[0]?.yearMonth).toBe('2026-08');
    expect(toNumericString(schedule.lines[0]!.amount)).toBe(toNumericString(total));
    assertInstallmentScheduleConserves(schedule, total);
  });

  it('rejects installment counts outside 1–120', () => {
    expect(() =>
      buildEqualInstallmentSchedule({
        totalNet: money('100', 'ILS'),
        installmentCount: 0,
        startYearMonth: '2026-01',
      }),
    ).toThrow(DomainRuleError);
  });
});
