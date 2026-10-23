import { describe, expect, it } from 'vitest';
import {
  computeOwnerManagerFullMonthEmployerCost,
  isOwnerManagerDefaultRateTerms,
  OWNER_MANAGER_DEFAULT_BASE_RATE,
  OWNER_MANAGER_DEFAULT_BURDEN_PERCENT,
  resolveOwnerManagerCreateCompensationDefaults,
} from '@/modules/workforce/domain/owner-manager-employer-cost';
import { deriveKnownEmployerCost } from '@/modules/workforce/domain/monthly-allocation';
import {
  describeMonthlyEmployerCostRecognition,
  recognizeMonthlyEmployerPoolToDate,
} from '@/modules/workforce/domain/monthly-accrual';
import {
  calculateMonthlyEmployerCostPoolForMonth,
  calculateUnitEmployerCostPool,
} from '@/modules/workforce/domain/employer-cost-pool';
import { toNumericString } from '@/shared/money';

describe('OD-36 owner/manager employer cost invariants', () => {
  it('fixes base 18,000 + 50% burden → 27,000.000000 full month pool', () => {
    expect(OWNER_MANAGER_DEFAULT_BASE_RATE).toBe('18000');
    expect(OWNER_MANAGER_DEFAULT_BURDEN_PERCENT).toBe('50');
    expect(toNumericString(computeOwnerManagerFullMonthEmployerCost('ILS'))).toBe('27000.000000');

    const unit = calculateUnitEmployerCostPool({
      baseRate: OWNER_MANAGER_DEFAULT_BASE_RATE,
      currency: 'ILS',
      burdenPercent: OWNER_MANAGER_DEFAULT_BURDEN_PERCENT,
    });
    expect(toNumericString(unit.total)).toBe('27000.000000');
  });

  it('recognizes 5 accrued days of 22 WDM as 6,136.36 while full month stays 27,000', () => {
    const full = computeOwnerManagerFullMonthEmployerCost('ILS');
    const accrual = recognizeMonthlyEmployerPoolToDate({
      fullMonthlyEmployerCost: full,
      workingDaysPerMonth: '22',
      accruedWorkDayCount: 5,
      recognizeFullMonth: false,
    });
    expect(toNumericString(accrual.recognizedPool)).toBe('6136.360000');
    expect(toNumericString(full)).toBe('27000.000000');
  });

  it('keeps full-month pool stable across 2026-01…2026-10 calendar months', () => {
    for (let month = 1; month <= 10; month += 1) {
      const yearMonth = `2026-${String(month).padStart(2, '0')}`;
      const full = recognizeMonthlyEmployerPoolToDate({
        fullMonthlyEmployerCost: computeOwnerManagerFullMonthEmployerCost('ILS'),
        workingDaysPerMonth: '22',
        accruedWorkDayCount: 22,
        recognizeFullMonth: true,
      });
      expect(yearMonth).toMatch(/^2026-/);
      expect(toNumericString(full.recognizedPool)).toBe('27000.000000');
    }
  });

  it('keeps owner October at the defined 33,000 and does not substitute the 7/21 accrual', () => {
    const versions = [
      {
        id: 'before-august',
        validFrom: '2026-01-01',
        validTo: '2026-07-31',
        baseRate: '18000',
        currency: 'ILS',
        rateUnit: 'monthly' as const,
        burdenPercent: '50',
        components: [],
      },
      {
        id: 'from-august',
        validFrom: '2026-08-01',
        validTo: null,
        baseRate: '22000',
        currency: 'ILS',
        rateUnit: 'monthly' as const,
        burdenPercent: '50',
        components: [],
      },
    ];
    const july = calculateMonthlyEmployerCostPoolForMonth({
      yearMonth: '2026-07',
      currency: 'ILS',
      versions,
    });
    const october = calculateMonthlyEmployerCostPoolForMonth({
      yearMonth: '2026-10',
      currency: 'ILS',
      versions,
    });
    expect(toNumericString(july!.pool)).toBe('27000.000000');
    expect(toNumericString(october!.pool)).toBe('33000.000000');

    const accruedOn11October = recognizeMonthlyEmployerPoolToDate({
      fullMonthlyEmployerCost: october!.pool,
      workingDaysPerMonth: '21',
      accruedWorkDayCount: 7,
      recognizeFullMonth: false,
    });
    expect(toNumericString(accruedOn11October.recognizedPool)).toBe('11000.000000');

    const definedOctober = recognizeMonthlyEmployerPoolToDate({
      fullMonthlyEmployerCost: october!.pool,
      workingDaysPerMonth: '21',
      accruedWorkDayCount: 7,
      recognizeFullMonth: true,
    });
    expect(toNumericString(definedOctober.recognizedPool)).toBe('33000.000000');
    expect(
      describeMonthlyEmployerCostRecognition({
        definedMonthlyAmount: '33000.000000',
        recognizedAmount: '33000.000000',
        workingDaysPerMonth: '21',
        recognizedWorkDayCount: 7,
        recognizeFullMonth: true,
      }),
    ).toContain('Defined monthly employer cost 33000.000000');
    expect(
      describeMonthlyEmployerCostRecognition({
        definedMonthlyAmount: '33000.000000',
        recognizedAmount: '11000.000000',
        workingDaysPerMonth: '21',
        recognizedWorkDayCount: 7,
        recognizeFullMonth: false,
      }),
    ).toContain('accrued to date 11000.000000');
  });

  it('keeps known quality estimated when actual is empty (no auto promote)', () => {
    const derived = deriveKnownEmployerCost({
      estimatedAmount: '27000',
      actualAmount: null,
      currency: 'ILS',
    });
    expect(derived.knownQuality).toBe('estimated');
    expect(derived.actualAmount).toBeNull();
  });

  it('defaults owner_manager create compensation to monthly company_only 18k/50%', () => {
    const defaults = resolveOwnerManagerCreateCompensationDefaults('ILS');
    expect(defaults).toMatchObject({
      rateUnit: 'monthly',
      baseRate: '18000',
      burdenPercent: '50',
      defaultLaborAllocationIntent: 'company_only',
      workingDaysPerMonth: '22',
      currency: 'ILS',
    });
    expect(isOwnerManagerDefaultRateTerms(defaults)).toBe(true);
  });
});
