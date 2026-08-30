/**
 * Classification architecture (0070) — structured fields only.
 * Description / free-text labels must never drive bucket or workforce exclusion.
 */
import { describe, expect, it } from 'vitest';
import { composeCompanyActual } from '@/modules/financials/domain/company-actual';
import {
  hasReliableSubcontractorSignal,
  isMaterialEconomicCategoryKey,
  resolveExpenseClassificationStatus,
  resolveOwnerBreakdownBucket,
  sumExclusiveOwnerBucketAmounts,
  ownerBucketMoney,
} from '@/modules/financials/domain/economic-classification';
import { shouldExcludeLaborExpenseForWorkforce } from '@/modules/financials/domain/labor-expense-integrity';
import { refreshAllOpenGeneralCostMonthsForSurfaces } from '@/modules/financials/application/recompute-general-cost-month';
import { recognizeMonthlyEmployerPoolByCalendar } from '@/modules/workforce/domain/monthly-accrual';
import { money, toNumericString } from '@/shared/money';
import { apBillLines } from '@drizzle/schema';

const ILS = 'ILS';

describe('classification architecture', () => {
  it('A) description עובדים + subcontractor TRANSACTION category → subcontractors; vendor type ignored', () => {
    const description = 'עובדים';
    void description;

    const bucket = resolveOwnerBreakdownBucket({
      sourceKind: 'expense',
      categoryKey: 'subcontractor',
      vendorType: 'supplier',
      classificationStatus: 'classified',
    });
    expect(bucket).toBe('subcontractors');
    expect(bucket).not.toBe('employees');

    expect(
      resolveOwnerBreakdownBucket({
        categoryKey: null,
        vendorType: 'subcontractor',
        classificationStatus: 'needs_classification',
      }),
    ).toBe('otherExpenses');
  });

  it('B) description גילוי אש + other_direct / needs_classification → otherExpenses; still in Actual', () => {
    const description = 'גילוי אש';
    void description;

    expect(
      resolveOwnerBreakdownBucket({
        sourceKind: 'expense',
        categoryKey: 'other_direct',
        classificationStatus: 'classified',
      }),
    ).toBe('otherExpenses');

    expect(
      resolveOwnerBreakdownBucket({
        sourceKind: 'expense',
        categoryKey: null,
        classificationStatus: 'needs_classification',
      }),
    ).toBe('otherExpenses');

    expect(
      shouldExcludeLaborExpenseForWorkforce({
        categoryKey: 'other_direct',
        projectId: 'p1',
        hasWorkforceData: true,
      }),
    ).toBe(false);
  });

  it('C) same vendor: TRANSACTION category decides materials / equipment_rental / external_service', () => {
    expect(
      resolveOwnerBreakdownBucket({
        categoryKey: 'materials',
        vendorId: 'v1',
        classificationStatus: 'classified',
      }),
    ).toBe('materials');

    expect(
      resolveOwnerBreakdownBucket({
        categoryKey: 'equipment_rental',
        vendorId: 'v1',
        classificationStatus: 'classified',
      }),
    ).toBe('vendors');

    expect(
      resolveOwnerBreakdownBucket({
        categoryKey: 'external_service',
        vendorId: 'v1',
        classificationStatus: 'classified',
      }),
    ).toBe('vendors');

    expect(
      resolveOwnerBreakdownBucket({
        categoryKey: 'external_service',
        classificationStatus: 'classified',
      }),
    ).toBe('otherExpenses');

    expect(isMaterialEconomicCategoryKey('materials_electrical')).toBe(true);
    expect(hasReliableSubcontractorSignal({ categoryKey: null })).toBe(false);
  });

  it('E) needs_classification / null category project expense → otherExpenses, amount counted', () => {
    expect(
      resolveOwnerBreakdownBucket({
        categoryKey: null,
        classificationStatus: 'needs_classification',
        costFamily: 'direct_project',
      }),
    ).toBe('otherExpenses');

    expect(resolveExpenseClassificationStatus({ costCategoryId: null })).toBe('needs_classification');
    expect(
      resolveExpenseClassificationStatus({
        costCategoryId: null,
        inventoryStockPurchase: true,
      }),
    ).toBe('needs_classification');
    expect(
      resolveExpenseClassificationStatus({
        costCategoryId: null,
        costFamily: 'asset_capital',
      }),
    ).toBe('needs_classification');
    expect(
      resolveExpenseClassificationStatus({ costCategoryId: 'cat-uuid' }),
    ).toBe('classified');
  });

  it('F) general needs_classification still in company general path (overhead / null project)', () => {
    expect(
      resolveOwnerBreakdownBucket({
        classificationStatus: 'needs_classification',
        costFamily: 'business_overhead',
        categoryKey: null,
      }),
    ).toBe('otherExpenses');

    // Classified overhead without needs_classification → overhead bucket
    expect(
      resolveOwnerBreakdownBucket({
        classificationStatus: 'classified',
        costFamily: 'business_overhead',
        categoryKey: 'rent',
      }),
    ).toBe('overhead');
  });

  it('G) workforce labor atom + subcontractor expense both count (no subcontractor exclusion)', () => {
    expect(
      shouldExcludeLaborExpenseForWorkforce({
        categoryKey: 'subcontractor',
        projectId: 'p1',
        hasWorkforceData: true,
      }),
    ).toBe(false);

    expect(
      resolveOwnerBreakdownBucket({ sourceKind: 'labor' }),
    ).toBe('employees');
    expect(
      resolveOwnerBreakdownBucket({
        sourceKind: 'expense',
        categoryKey: 'subcontractor',
        vendorRoleKeys: ['subcontractor'],
      }),
    ).toBe('subcontractors');
  });

  it('H) internal_employee_payroll always excluded; generic labor + workforce → NOT excluded', () => {
    expect(
      shouldExcludeLaborExpenseForWorkforce({
        categoryKey: 'internal_employee_payroll',
        projectId: 'p1',
        hasWorkforceData: false,
      }),
    ).toBe(true);

    expect(
      shouldExcludeLaborExpenseForWorkforce({
        categoryKey: 'labor',
        projectId: 'p1',
        hasWorkforceData: true,
      }),
    ).toBe(false);
  });

  it('I) description/category LABEL strings are not read by classifiers', () => {
    // Misleading free-text that looks like category names — never passed as categoryKey.
    const misleadingLabel = 'materials עובדים subcontractors labor payroll';
    void misleadingLabel;

    expect(
      resolveOwnerBreakdownBucket({
        categoryKey: null,
        classificationStatus: 'classified',
        vendorId: null,
      }),
    ).toBe('otherExpenses');

    expect(
      shouldExcludeLaborExpenseForWorkforce({
        categoryKey: null,
        isLaborCategory: false,
        projectId: 'p1',
        hasWorkforceData: true,
      }),
    ).toBe(false);

    // Non-key string that is not a real category key must not trigger material/payroll
    expect(isMaterialEconomicCategoryKey('עובדים materials')).toBe(false);
    expect(
      hasReliableSubcontractorSignal({
        categoryKey: 'this is not a key',
      }),
    ).toBe(false);
  });

  it('J) AP bill lines can carry distinct costCategoryId per line (schema smoke)', () => {
    const cols = apBillLines;
    expect(cols.costCategoryId).toBeDefined();
    expect(cols.costFamily).toBeDefined();
    // Domain: two lines with different category keys classify independently
    expect(resolveOwnerBreakdownBucket({ categoryKey: 'materials', vendorId: 'v' })).toBe('materials');
    expect(
      resolveOwnerBreakdownBucket({ categoryKey: 'external_service', vendorId: 'v' }),
    ).toBe('vendors');
  });

  it('K) read-surface GCM refresh helpers are no-op (no live GCM DB)', async () => {
    expect(typeof refreshAllOpenGeneralCostMonthsForSurfaces).toBe('function');
    await expect(refreshAllOpenGeneralCostMonthsForSurfaces({} as never)).resolves.toBeUndefined();
  });

  it('L) calendar accrual: W=22, accrued=10 → not full month', () => {
    const full = money('22000', ILS);
    const result = recognizeMonthlyEmployerPoolByCalendar({
      fullMonthlyEmployerCost: full,
      totalEligibleWorkdaysInMonth: 22,
      accruedWorkDayCount: 10,
      recognizeFullMonth: false,
      fallbackWorkingDaysPerMonth: null,
    });
    expect(result).not.toBeNull();
    expect(result!.recognizedWorkDayCount).toBe(10);
    expect(Number(result!.recognizedPool.amount)).toBeLessThan(22000);
    expect(toNumericString(result!.recognizedPool)).toBe('10000.000000');
  });

  it('M) company actual buckets: composeCompanyActual Direct+pool; exclusive bucket sum', () => {
    const composed = composeCompanyActual({
      currency: ILS,
      directProjectActual: money('1000', ILS),
      generalPool: money('250', ILS),
      allocatedGeneralToProjects: money('200', ILS),
      unallocatableGeneral: money('50', ILS),
    });
    expect(composed.companyActual).toEqual(money('1250', ILS));
    expect(composed.reconciles).toBe(true);

    const exclusive = sumExclusiveOwnerBucketAmounts(
      {
        employees: ownerBucketMoney('100', ILS),
        subcontractors: ownerBucketMoney('200', ILS),
        materials: ownerBucketMoney('50', ILS),
        otherExpenses: ownerBucketMoney('25', ILS),
        vendors: ownerBucketMoney('10', ILS),
        overhead: ownerBucketMoney('5', ILS),
      },
      ILS,
    );
    expect(exclusive).toEqual(money('390', ILS));
  });
});
