/**
 * EXEC proof for WF-004 — low WDM denominator front-loads employer pool recognition.
 * AUDIT ONLY.
 */
import { describe, expect, it } from 'vitest';
import { recognizeMonthlyEmployerPoolToDate } from '@/modules/workforce/domain/monthly-accrual';
import { money, toNumericString } from '@/shared/money';

describe('audit WF-004: monthly accrual exact amounts (EXEC)', () => {
  it('recognizes full pool in 5 accrued days when WDM=5 vs partial when WDM=22', () => {
    const full = money('9750', 'ILS');
    const lowW = recognizeMonthlyEmployerPoolToDate({
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '5',
      accruedWorkDayCount: 5,
      recognizeFullMonth: false,
    });
    const calW = recognizeMonthlyEmployerPoolToDate({
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '22',
      accruedWorkDayCount: 5,
      recognizeFullMonth: false,
    });
    expect(Number(lowW.recognizedPool.amount)).toBeGreaterThan(Number(calW.recognizedPool.amount));
    expect(toNumericString(lowW.recognizedPool)).toBe('3250.000000');
    expect(toNumericString(calW.recognizedPool)).toBe('2215.910000');
  });
});
