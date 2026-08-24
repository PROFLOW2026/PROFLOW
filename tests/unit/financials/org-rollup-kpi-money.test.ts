import { describe, expect, it } from 'vitest';
import {
  buildSliceAvailability,
  resolveProjectFinancialKpiAvailability,
} from '@/modules/financials/domain/financial-slice-availability';
import { resolveOrgRollupKpiMoneyFields } from '@/modules/financials/domain/org-rollup-kpi-money';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

function baseFinancials(overrides: Partial<ProjectFinancials> = {}): ProjectFinancials {
  return {
    projectId: 'p1',
    currency: ILS,
    workKind: 'project',
    pricingMode: null,
    priceNotSet: false,
    commercial: {
      originalContractValue: money('100000', ILS),
      approvedAdditions: zeroMoney(ILS),
      approvedReductions: zeroMoney(ILS),
      currentContractValue: money('100000', ILS),
      pendingChanges: zeroMoney(ILS),
    },
    billing: {
      invoiced: money('1000', ILS),
      netInvoiced: money('1000', ILS),
      paid: money('400', ILS),
      outstanding: money('600', ILS),
      monthCloseRevenueNet: zeroMoney(ILS),
      hasBillingData: true,
    },
    cost: {
      actualCostToDate: money('5000', ILS),
      estimatedFinalCost: money('8000', ILS),
      byFamily: {
        directProject: money('4000', ILS),
        shared: zeroMoney(ILS),
        businessOverhead: money('1000', ILS),
        assetCapital: zeroMoney(ILS),
      },
      laborActual: money('2000', ILS),
      vendorActual: money('3000', ILS),
      overheadActual: money('1000', ILS),
      committedOpen: money('1500', ILS),
      expectedRemainingCost: money('1500', ILS),
      openApPayable: money('200', ILS),
      monthCloseCostNet: zeroMoney(ILS),
      directActualCostToDate: money('5000', ILS),
      allocatedGeneralBusinessCost: zeroMoney(ILS),
      fullActualCostToDate: money('5000', ILS),
    },
    profit: {
      estimatedProfit: money('92000', ILS),
      marginPercent: '92.00',
      actualProfit: money('95000', ILS),
      actualMarginPercent: '95.00',
    },
    coverage: {
      basis: 'direct_only',
      entries: [],
      calculatedAt: new Date(),
    },
    sliceAvailability: buildSliceAvailability({
      canReadCommercial: true,
      canReadBilling: true,
      canReadExpenses: true,
      canReadWorkforce: true,
      canReadProcurement: true,
      canReadAp: true,
      laborLoaded: true,
    }),
    dataConfidence: { level: 'high', reasons: [] },
    ...overrides,
  };
}

describe('org rollup KPI money (N-002)', () => {
  it('nulls actualCost when expenses permission denied (not zero)', () => {
    const financials = baseFinancials({
      sliceAvailability: buildSliceAvailability({
        canReadCommercial: true,
        canReadBilling: true,
        canReadExpenses: false,
        canReadWorkforce: true,
        canReadProcurement: true,
        canReadAp: true,
        laborLoaded: true,
      }),
    });
    const kpiAvailability = resolveProjectFinancialKpiAvailability(financials);
    expect(kpiAvailability.actualCost).toBe('partial');

    const fields = resolveOrgRollupKpiMoneyFields({
      kpiAvailability,
      canBilling: true,
      canProfit: true,
      priceNotSet: false,
      invoiced: financials.billing.invoiced,
      paid: financials.billing.paid,
      outstanding: financials.billing.outstanding,
      actualCost: financials.cost.actualCostToDate,
      laborActual: financials.cost.laborActual,
      vendorActual: financials.cost.vendorActual,
      overheadActual: financials.cost.overheadActual,
      committedOpen: financials.cost.committedOpen,
      openApPayable: financials.cost.openApPayable,
      expectedRemainingCost: financials.cost.expectedRemainingCost,
      estimatedFinalCost: financials.cost.estimatedFinalCost,
      assetCapitalActual: financials.cost.byFamily.assetCapital,
      estimatedProfit: financials.profit?.estimatedProfit ?? null,
      marginPercent: financials.profit?.marginPercent ?? null,
      actualProfit: financials.profit?.actualProfit ?? null,
      actualMarginPercent: financials.profit?.actualMarginPercent ?? null,
    });

    expect(fields.actualCost).toBeNull();
    expect(fields.laborActual).toBeNull();
    expect(fields.vendorActual).toBeNull();
    expect(fields.overheadActual).toBeNull();
    expect(fields.estimatedFinalCost).toBeNull();
    expect(fields.expectedRemainingCost).toBeNull();
    expect(fields.actualProfit).toBeNull();
    expect(fields.estimatedProfit).toBeNull();
    // Committed still readable when procurement allowed.
    expect(fields.committedOpen).toEqual(money('1500', ILS));
    expect(fields.openApPayable).toEqual(money('200', ILS));
  });

  it('keeps numeric Actual when all cost slices are loaded', () => {
    const financials = baseFinancials();
    const kpiAvailability = resolveProjectFinancialKpiAvailability(financials);
    expect(kpiAvailability.actualCost).toBe('value');

    const fields = resolveOrgRollupKpiMoneyFields({
      kpiAvailability,
      canBilling: true,
      canProfit: true,
      priceNotSet: false,
      invoiced: financials.billing.invoiced,
      paid: financials.billing.paid,
      outstanding: financials.billing.outstanding,
      actualCost: financials.cost.actualCostToDate,
      laborActual: financials.cost.laborActual,
      vendorActual: financials.cost.vendorActual,
      overheadActual: financials.cost.overheadActual,
      committedOpen: financials.cost.committedOpen,
      openApPayable: financials.cost.openApPayable,
      expectedRemainingCost: financials.cost.expectedRemainingCost,
      estimatedFinalCost: financials.cost.estimatedFinalCost,
      assetCapitalActual: financials.cost.byFamily.assetCapital,
      estimatedProfit: financials.profit?.estimatedProfit ?? null,
      marginPercent: financials.profit?.marginPercent ?? null,
      actualProfit: financials.profit?.actualProfit ?? null,
      actualMarginPercent: financials.profit?.actualMarginPercent ?? null,
    });

    expect(fields.actualCost).toEqual(money('5000', ILS));
    expect(fields.estimatedFinalCost).toEqual(money('8000', ILS));
    expect(fields.estimatedProfit).toEqual(money('92000', ILS));
  });
});
