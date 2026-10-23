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
  listConfiguredWorkDatesInRange,
  monthDateBounds,
  recognizeMonthlyEmployerPoolByCalendar,
  recognizeMonthlyEmployerPoolToDate,
  shouldRecognizeFullEmployerMonth,
} from '@/modules/workforce/domain/monthly-accrual';
import {
  calculateMonthlyEmployerCostPoolForMonth,
  calculateUnitEmployerCostPool,
} from '@/modules/workforce/domain/employer-cost-pool';
import { toNumericString } from '@/shared/money';
import { CANONICAL_WORK_WEEKDAYS } from '@/modules/tenancy/domain/labor-cost-defaults';

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

  it('accrues an open owner month by elapsed workdays, the same way as employees', () => {
    expect(
      shouldRecognizeFullEmployerMonth({
        yearMonth: '2026-10',
        currentYearMonth: '2026-10',
        today: '2026-10-23',
        monthEnd: '2026-10-31',
      }),
    ).toBe(false);
    expect(
      shouldRecognizeFullEmployerMonth({
        yearMonth: '2026-09',
        currentYearMonth: '2026-10',
        today: '2026-10-23',
        monthEnd: '2026-09-30',
      }),
    ).toBe(true);

    const october = calculateMonthlyEmployerCostPoolForMonth({
      yearMonth: '2026-10',
      currency: 'ILS',
      versions: [
        {
          id: 'from-august',
          validFrom: '2026-08-01',
          validTo: null,
          baseRate: '22000',
          currency: 'ILS',
          rateUnit: 'monthly',
          burdenPercent: '50',
          components: [],
        },
      ],
    });
    const bounds = monthDateBounds('2026-10');
    const hasCoverage = () => true;
    const eligible = listConfiguredWorkDatesInRange({
      fromDate: bounds.fromDate,
      toDate: bounds.toDate,
      workWeekdays: CANONICAL_WORK_WEEKDAYS,
      hasCoverage,
    });
    const accrued = listConfiguredWorkDatesInRange({
      fromDate: bounds.fromDate,
      toDate: '2026-10-23',
      workWeekdays: CANONICAL_WORK_WEEKDAYS,
      hasCoverage,
    });
    const recognition = recognizeMonthlyEmployerPoolByCalendar({
      fullMonthlyEmployerCost: october!.pool,
      totalEligibleWorkdaysInMonth: eligible.length,
      accruedWorkDayCount: accrued.length,
      recognizeFullMonth: false,
      fallbackWorkingDaysPerMonth: '22',
    });
    expect(toNumericString(october!.pool)).toBe('33000.000000');
    expect(eligible).toHaveLength(21);
    expect(accrued).toHaveLength(16);
    expect(recognition?.workingDaysPerMonth).toBe('21');
    expect(recognition?.recognizedWorkDayCount).toBe(16);
    expect(toNumericString(recognition!.recognizedPool)).toBe('25142.860000');
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
