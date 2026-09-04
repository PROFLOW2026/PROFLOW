import { describe, expect, it } from 'vitest';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import {
  buildSliceAvailability,
  resolveProjectFinancialKpiAvailability,
} from '@/modules/financials/domain/financial-slice-availability';
import { zeroMoney } from '@/shared/money';

function baseFinancials(overrides: Partial<ProjectFinancials> = {}): ProjectFinancials {
  const currency = 'ILS';
  return {
    projectId: 'p1',
    currency,
    workKind: 'project',
    pricingMode: null,
    priceNotSet: false,
    commercial: {
      originalContractValue: zeroMoney(currency),
      approvedAdditions: zeroMoney(currency),
      approvedReductions: zeroMoney(currency),
      currentContractValue: { amount: '100000', currency },
      pendingChanges: zeroMoney(currency),
    },
    billing: {
      invoiced: zeroMoney(currency),
      netInvoiced: zeroMoney(currency),
      paid: zeroMoney(currency),
      outstanding: zeroMoney(currency),
      monthCloseRevenueNet: zeroMoney(currency),
      hasBillingData: false,
    },
    cost: {
      actualCostToDate: { amount: '5000', currency },
      estimatedFinalCost: { amount: '8000', currency },
      byFamily: {
        directProject: zeroMoney(currency),
        shared: zeroMoney(currency),
        businessOverhead: zeroMoney(currency),
        assetCapital: zeroMoney(currency),
      },
      laborActual: zeroMoney(currency),
      vendorActual: { amount: '5000', currency },
      overheadActual: zeroMoney(currency),
      committedOpen: zeroMoney(currency),
      expectedRemainingCost: zeroMoney(currency),
      openApPayable: zeroMoney(currency),
      monthCloseCostNet: zeroMoney(currency),
      directActualCostToDate: { amount: '5000', currency },
      allocatedGeneralBusinessCost: zeroMoney(currency),
      fullActualCostToDate: { amount: '5000', currency },
      futureGeneralAllocatedForecast: zeroMoney(currency),
      directForecastFinalCost: { amount: '8000', currency },
      fullForecastFinalCost: { amount: '8000', currency },
    },
    profit: null,
    coverage: {
      basis: 'direct_only',
      entries: [{ source: 'subcontractor', included: true }],
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

describe('financial-slice-availability KPI resolution', () => {
  it('keeps recognized Actual when residual hours lack time-entry cost (R-007)', () => {
    const financials = baseFinancials({
      coverage: {
        basis: 'direct_only',
        entries: [],
        calculatedAt: new Date(),
        partials: [{ reason: 'workforce_entries_missing_cost', count: 3 }],
      },
      profit: {
        estimatedProfit: { amount: '95000', currency: 'ILS' },
        actualProfit: { amount: '95000', currency: 'ILS' },
        marginPercent: '95',
        actualMarginPercent: '95',
      },
    });

    const availability = resolveProjectFinancialKpiAvailability(financials);
    expect(availability.actualCost).toBe('value');
    expect(availability.forecastCost).toBe('value');
    expect(availability.actualProfit).toBe('value');
  });

  it('withholds Actual only when labor is unresolved and no recognized cost exists', () => {
    const currency = 'ILS';
    const financials = baseFinancials({
      cost: {
        actualCostToDate: { amount: '0', currency },
        estimatedFinalCost: { amount: '0', currency },
        byFamily: {
          directProject: { amount: '0', currency },
          shared: { amount: '0', currency },
          businessOverhead: { amount: '0', currency },
          assetCapital: { amount: '0', currency },
        },
        laborActual: { amount: '0', currency },
        vendorActual: { amount: '0', currency },
        overheadActual: { amount: '0', currency },
        committedOpen: { amount: '0', currency },
        expectedRemainingCost: { amount: '0', currency },
        openApPayable: { amount: '0', currency },
        monthCloseCostNet: { amount: '0', currency },
        directActualCostToDate: { amount: '0', currency },
        allocatedGeneralBusinessCost: { amount: '0', currency },
        fullActualCostToDate: { amount: '0', currency },
        futureGeneralAllocatedForecast: { amount: '0', currency },
        directForecastFinalCost: { amount: '0', currency },
        fullForecastFinalCost: { amount: '0', currency },
      },
      coverage: {
        basis: 'direct_only',
        entries: [],
        calculatedAt: new Date(),
        partials: [{ reason: 'workforce_entries_missing_cost', count: 2 }],
      },
    });

    const availability = resolveProjectFinancialKpiAvailability(financials);
    expect(availability.actualCost).toBe('unavailable');
    expect(availability.forecastCost).toBe('unavailable');
    expect(availability.actualProfit).toBe('unavailable');
  });

  it('marks actual partial when expense slice permission denied (R-005)', () => {
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

    const availability = resolveProjectFinancialKpiAvailability(financials);
    expect(availability.actualCost).toBe('partial');
  });
});
