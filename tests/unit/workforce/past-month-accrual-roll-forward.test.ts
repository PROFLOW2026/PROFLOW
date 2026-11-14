import { describe, expect, it } from 'vitest';
import { priorCalendarYearMonth } from '@/modules/workforce/application/ensure-open-monthly-labor-fresh';
import {
  describeMonthlyEmployerCostRecognition,
  shouldRecognizeFullEmployerMonth,
} from '@/modules/workforce/domain/monthly-accrual';
import { shouldPreserveRecordedActualEmployerCost } from '@/modules/workforce/application/monthly-cost-recompute';

describe('past-month employer accrual roll-forward', () => {
  it('targets the prior calendar month from Asia/Jerusalem current month', () => {
    expect(priorCalendarYearMonth('2026-11')).toBe('2026-10');
    expect(priorCalendarYearMonth('2026-01')).toBe('2025-12');
  });

  it('recognizes full month for past months (Eran Oct after Nov start)', () => {
    expect(
      shouldRecognizeFullEmployerMonth({
        yearMonth: '2026-10',
        currentYearMonth: '2026-11',
        today: '2026-11-14',
        monthEnd: '2026-10-31',
      }),
    ).toBe(true);

    expect(
      describeMonthlyEmployerCostRecognition({
        definedMonthlyAmount: '33000.000000',
        recognizedAmount: '33000.000000',
        workingDaysPerMonth: '21',
        recognizedWorkDayCount: 21,
        recognizeFullMonth: true,
      }),
    ).toContain('recognized full month 33000.000000');
  });

  it('still accrues open current month by workdays for owners', () => {
    expect(
      shouldRecognizeFullEmployerMonth({
        yearMonth: '2026-11',
        currentYearMonth: '2026-11',
        today: '2026-11-14',
        monthEnd: '2026-11-30',
      }),
    ).toBe(false);
  });

  it('preserves recorded actual rows during roll-forward recompute', () => {
    expect(
      shouldPreserveRecordedActualEmployerCost({
        knownQuality: 'actual',
        actualAmount: '26900.000000',
      }),
    ).toBe(true);
    expect(
      shouldPreserveRecordedActualEmployerCost({
        knownQuality: 'estimated',
        actualAmount: null,
      }),
    ).toBe(false);
  });
});
