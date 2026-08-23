import { describe, expect, it } from 'vitest';
import type { ProjectFinancials } from '@/modules/financials/domain/types';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import { buildSliceAvailability } from '@/modules/financials/domain/financial-slice-availability';
import { zeroMoney } from '@/shared/money';

/**
 * Contract for profit visibility: unauthorized viewers must receive null,
 * never a zero profit that looks like break-even (VAT ≠ profit / profit access).
 */
function redactProfitForViewer(
  financials: ProjectFinancials,
  canReadProfit: boolean,
): ProjectFinancials {
  if (canReadProfit && financials.commercial) return financials;
  return { ...financials, profit: null };
}

const allSlicesLoaded = buildSliceAvailability({
  canReadCommercial: true,
  canReadBilling: true,
  canReadExpenses: true,
  canReadWorkforce: true,
  canReadProcurement: true,
  canReadAp: true,
  laborLoaded: true,
});

describe('project profit permission shape', () => {
  const currency = 'ILS';
  const zero = zeroMoney(currency);

  const base: ProjectFinancials = {
    projectId: 'p1',
    currency,
    workKind: 'project',
    pricingMode: null,
    priceNotSet: false,
    commercial: {
      originalContractValue: { amount: '100000.000000', currency },
      approvedAdditions: zero,
      approvedReductions: zero,
      currentContractValue: { amount: '100000.000000', currency },
      pendingChanges: zero,
    },
    billing: {
      invoiced: zero,
      paid: zero,
      outstanding: zero,
      netInvoiced: zero,
      hasBillingData: false,
      monthCloseRevenueNet: zero,
    },
    cost: {
      actualCostToDate: { amount: '40000.000000', currency },
      estimatedFinalCost: { amount: '40000.000000', currency },
      byFamily: {
        directProject: { amount: '40000.000000', currency },
        shared: zero,
        businessOverhead: zero,
        assetCapital: zero,
      },
      laborActual: zero,
      vendorActual: zero,
      overheadActual: zero,
      committedOpen: zero,
      expectedRemainingCost: zero,
      openApPayable: zero,
      monthCloseCostNet: zero,
    },
    profit: {
      estimatedProfit: { amount: '60000.000000', currency },
      marginPercent: '60.00',
      actualProfit: { amount: '60000.000000', currency },
      actualMarginPercent: '60.00',
    },
    coverage: buildFinancialCoverage([{ source: 'direct_expenses', hasData: true }], new Date()),
    sliceAvailability: allSlicesLoaded,
    dataConfidence: { level: 'high', reasons: [] },
  };

  it('keeps profit when viewer may read it', () => {
    const view = redactProfitForViewer(base, true);
    expect(view.profit?.estimatedProfit.amount).toBe('60000.000000');
  });

  it('nulls profit instead of substituting zeros when unauthorized', () => {
    const view = redactProfitForViewer(base, false);
    expect(view.profit).toBeNull();
    expect(view.profit?.estimatedProfit?.amount).not.toBe('0.000000');
  });
});
