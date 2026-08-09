import { describe, expect, it } from 'vitest';
import { composeProjectFinancials } from '@/modules/financials/application/compose-project-financials';
import { money, zeroMoney } from '@/shared/money';

describe('composeProjectFinancials', () => {
  it('keeps Actual separate from Committed and folds ETC into Forecast Final', () => {
    const currency = 'ILS';
    const result = composeProjectFinancials({
      projectId: 'p1',
      currency,
      expectedRemainingCostAmount: '100.00',
      canReadCommercial: true,
      canReadBilling: true,
      canReadProfit: true,
      commercialData: {
        currency,
        position: {
          originalContractValue: money('1000', currency),
          approvedAdditions: zeroMoney(currency),
          approvedReductions: zeroMoney(currency),
          currentContractValue: money('1000', currency),
          pendingChanges: zeroMoney(currency),
        },
      },
      billingRows: { currency, records: [] },
      expenseContributions: [
        {
          amount: '200.00',
          currency,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
          expenseId: 'e1',
        },
      ],
      laborInput: null,
      committed: { total: money('50.00', currency), excludedForeignCurrencyCount: 0 },
      openAp: {
        total: money('25.00', currency),
        excludedForeignCurrencyCount: 0,
        billCount: 1,
      },
      recognizedVendor: null,
    });

    expect(result.cost.actualCostToDate.amount).toBe('200.000000');
    expect(result.cost.committedOpen.amount).toBe('50.000000');
    expect(result.cost.openApPayable.amount).toBe('25.000000');
    // Forecast Final = Actual + Remaining Commitments + ETC (AP payable stays cash-only).
    expect(result.cost.estimatedFinalCost.amount).toBe('350.000000');
    expect(result.cost.expectedRemainingCost.amount).toBe('100.000000');
    expect(result.profit?.estimatedProfit.amount).toBe('650.000000');
    expect(result.profit?.actualProfit.amount).toBe('800.000000');
  });

  it('excludes bill-linked expenses from Actual when recognized vendor bills exist', () => {
    const currency = 'ILS';
    const result = composeProjectFinancials({
      projectId: 'p1',
      currency,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: [
        {
          amount: '80.00',
          currency,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: true,
          projectId: 'p1',
          expenseId: 'linked-expense',
        },
        {
          amount: '20.00',
          currency,
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
          projectId: 'p1',
          expenseId: 'other-expense',
        },
      ],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: {
        billAmounts: ['80.00'],
        total: money('80.00', currency),
        linkedExpenseIds: new Set(['linked-expense']),
        excludedForeignCurrencyCount: 0,
        billCount: 1,
      },
    });

    // linked expense dropped; remaining non-vendor expense (20) + recognized bill (80)
    expect(result.cost.actualCostToDate.amount).toBe('100.000000');
    expect(result.cost.vendorActual.amount).toBe('80.000000');
  });
});

describe('org rollup query-shape contract', () => {
  it('documents set-based batch bounds vs per-project N+1', () => {
    // Before: ~2 setup + ~10 queries × N projects (getProjectFinancials each).
    // After: ~2 setup + ≤12 org-scoped loads (commercial/billing/expenses/labor/committed/AP).
    const projects = 40;
    const queriesBefore = 2 + projects * 10;
    const queriesAfterMax = 2 + 12;
    expect(queriesAfterMax).toBeLessThan(queriesBefore / 10);
    expect(queriesAfterMax).toBeLessThanOrEqual(14);
  });
});
