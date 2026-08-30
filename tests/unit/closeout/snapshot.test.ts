import { describe, expect, it } from 'vitest';
import { money, zeroMoney } from '@/shared/money';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { buildSliceAvailability } from '@/modules/financials/domain/financial-slice-availability';
import { buildCloseoutFinancialSnapshot } from '@/modules/closeout';

const allSlicesLoaded = buildSliceAvailability({
  canReadCommercial: true,
  canReadBilling: true,
  canReadExpenses: true,
  canReadWorkforce: true,
  canReadProcurement: true,
  canReadAp: true,
  laborLoaded: true,
});

function financials(overrides: Partial<ProjectFinancials> = {}): ProjectFinancials {
  const currency = 'ILS';
  return {
    projectId: 'proj-1',
    currency,
    workKind: 'project',
    pricingMode: null,
    priceNotSet: false,
    commercial: {
      originalContractValue: money('100000', currency),
      approvedAdditions: money('5000', currency),
      approvedReductions: zeroMoney(currency),
      currentContractValue: money('105000', currency),
      pendingChanges: money('2000', currency),
    },
    billing: {
      invoiced: money('20000', currency),
      paid: money('8000', currency),
      outstanding: money('12000', currency),
      netInvoiced: money('20000', currency),
      hasBillingData: true,
      monthCloseRevenueNet: zeroMoney(currency),
    },
    cost: {
      actualCostToDate: money('30000', currency),
      estimatedFinalCost: money('80000', currency),
      byFamily: {
        directProject: money('25000', currency),
        shared: zeroMoney(currency),
        businessOverhead: zeroMoney(currency),
        assetCapital: zeroMoney(currency),
      },
      laborActual: money('9000', currency),
      vendorActual: money('4000', currency),
      overheadActual: zeroMoney(currency),
      committedOpen: money('15000', currency),
      expectedRemainingCost: money('35000', currency),
      openApPayable: money('3000', currency),
      monthCloseCostNet: zeroMoney(currency),
      directActualCostToDate: money('30000', currency),
      allocatedGeneralBusinessCost: zeroMoney(currency),
      fullActualCostToDate: money('30000', currency),
      futureGeneralAllocatedForecast: zeroMoney(currency),
      directForecastFinalCost: money('80000', currency),
      fullForecastFinalCost: money('80000', currency),
    },
    profit: {
      estimatedProfit: money('25000', currency),
      marginPercent: '23.81',
      actualProfit: money('75000', currency),
      actualMarginPercent: '71.43',
    },
    coverage: {
      basis: 'direct_only',
      entries: [],
      calculatedAt: new Date('2026-08-16T00:00:00Z'),
    },
    sliceAvailability: allSlicesLoaded,
    dataConfidence: { level: 'high', reasons: [] },
    ...overrides,
  };
}

describe('closeout financial snapshot', () => {
  it('copies existing engine net figures without inventing a second engine', () => {
    const snapshot = buildCloseoutFinancialSnapshot(financials(), {
      canReadProfit: true,
      capturedAt: new Date('2026-08-17T00:00:00Z'),
    });
    expect(snapshot.originalContract).toEqual({ amount: money('100000', 'ILS').amount, currency: 'ILS' });
    expect(snapshot.currentContract?.amount).toBe(money('105000', 'ILS').amount);
    expect(snapshot.approvedChanges?.amount).toBe(money('5000', 'ILS').amount);
    expect(snapshot.actualCost.amount).toBe(money('30000', 'ILS').amount);
    expect(snapshot.remainingCommitments.amount).toBe(money('15000', 'ILS').amount);
    expect(snapshot.totalBilling.amount).toBe(money('20000', 'ILS').amount);
    expect(snapshot.paymentsReceived.amount).toBe(money('8000', 'ILS').amount);
    expect(snapshot.outstandingClient.amount).toBe(money('12000', 'ILS').amount);
    expect(snapshot.supplierOutstanding.amount).toBe(money('3000', 'ILS').amount);
    expect(snapshot.expectedProfit?.amount).toBe(money('75000', 'ILS').amount);
    expect(snapshot.profitHidden).toBe(false);
  });

  it('hides profit without inventing zeros when permission is missing', () => {
    const snapshot = buildCloseoutFinancialSnapshot(financials(), { canReadProfit: false });
    expect(snapshot.profitHidden).toBe(true);
    expect(snapshot.expectedProfit).toBeNull();
    expect(snapshot.marginPercent).toBeNull();
  });

  it('hides profit when the engine already omitted it', () => {
    const snapshot = buildCloseoutFinancialSnapshot(financials({ profit: null }), {
      canReadProfit: true,
    });
    expect(snapshot.profitHidden).toBe(true);
    expect(snapshot.expectedProfit).toBeNull();
  });
});
