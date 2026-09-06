import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money/money';
import {
  aggregateBillingPosition,
  sumInvoicedAmounts,
  sumNetInvoicedAmounts,
} from '@/modules/billing/domain/outstanding';
import { resolveProjectKpiDisplay } from '@/modules/financials/ui/resolve-kpi-display';
import type { ProjectFinancials } from '@/modules/financials/domain/types';

describe('billing NET vs GROSS for project revenue', () => {
  const ILS = 'ILS';

  it('sums NET (subtotal) separately from GROSS (total) when VAT is present', () => {
    const records = [
      {
        kind: 'invoice' as const,
        status: 'finalized' as const,
        totalAmount: money('96718.5', ILS),
        subtotalAmount: money('96718.5', ILS),
        payments: [],
      },
      {
        kind: 'invoice' as const,
        status: 'finalized' as const,
        totalAmount: money('91351.47', ILS),
        subtotalAmount: money('77416.5', ILS),
        payments: [],
      },
    ];

    expect(sumNetInvoicedAmounts(records, ILS).amount).toBe('174135.000000');
    expect(sumInvoicedAmounts(records, ILS).amount).toBe('188069.970000');

    const position = aggregateBillingPosition(records, ILS);
    expect(position.netInvoiced.amount).toBe('174135.000000');
    expect(position.invoiced.amount).toBe('188069.970000');
    // VAT contamination of revenue = gross - net
    expect(
      (
        Number(position.invoiced.amount) - Number(position.netInvoiced.amount)
      ).toFixed(2),
    ).toBe('13934.97');
  });

  it('resolveProjectKpiDisplay.billed uses NET, not GROSS', () => {
    const zero = money('0', ILS);
    const financials = {
      projectId: 'p1',
      currency: ILS,
      workKind: 'project',
      pricingMode: 'fixed',
      priceNotSet: false,
      commercial: {
        originalContractValue: money('990000', ILS),
        approvedAdditions: zero,
        approvedReductions: zero,
        currentContractValue: money('990000', ILS),
        pendingChanges: zero,
      },
      billing: {
        invoiced: money('188069.97', ILS),
        netInvoiced: money('174135', ILS),
        paid: money('96718.5', ILS),
        outstanding: money('91351.47', ILS),
        hasBillingData: true,
      },
      cost: {
        actualCostToDate: zero,
        estimatedFinalCost: zero,
        expectedRemainingCost: zero,
        laborActual: zero,
        vendorActual: zero,
        overheadActual: zero,
        committedOpen: zero,
        openApPayable: zero,
        byFamily: {
          directProject: zero,
          businessOverhead: zero,
          shared: zero,
          assetCapital: zero,
        },
        directActualCostToDate: zero,
        fullActualCostToDate: zero,
        directForecastFinalCost: zero,
        fullForecastFinalCost: zero,
        futureGeneralAllocatedForecast: zero,
      },
      profit: null,
      coverage: { basis: 'direct', entries: [], generatedAt: new Date() },
      kpiAvailability: undefined,
    } as unknown as ProjectFinancials;

    const kpis = resolveProjectKpiDisplay(financials);
    expect(kpis.billed.amount).toBe('174135.000000');
    expect(kpis.billedGross.amount).toBe('188069.970000');
    expect(kpis.outstanding.amount).toBe('91351.470000');
  });
});
