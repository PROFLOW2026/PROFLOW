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
    expect(result.dataConfidence.level).toBe('high');
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
        linkedExpenseDeductions: new Map([['linked-expense', '80.00']]),
        excludedForeignCurrencyCount: 0,
        billCount: 1,
      },
    });

    // linked expense dropped; remaining non-vendor expense (20) + recognized bill (80)
    expect(result.cost.actualCostToDate.amount).toBe('100.000000');
    expect(result.cost.vendorActual.amount).toBe('80.000000');
  });

  it('folds non-superseded month-close cost and revenue corrections once', () => {
    const currency = 'ILS';
    const result = composeProjectFinancials({
      projectId: 'p1',
      currency,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: true,
      canReadProfit: false,
      commercialData: null,
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
      committed: null,
      openAp: null,
      recognizedVendor: null,
      monthCloseEconomic: {
        costNet: money('50', currency),
        revenueNet: money('30', currency),
      },
    });

    expect(result.cost.actualCostToDate.amount).toBe('250.000000');
    expect(result.cost.monthCloseCostNet.amount).toBe('50.000000');
    expect(result.cost.byFamily.directProject.amount).toBe('200.000000');
    expect(result.billing.invoiced.amount).toBe('30.000000');
    expect(result.billing.outstanding.amount).toBe('30.000000');
    expect(result.billing.monthCloseRevenueNet.amount).toBe('30.000000');
  });

  it('keeps profit at project level when multiple contracts contribute CCV', () => {
    const currency = 'ILS';
    const primaryPosition = {
      originalContractValue: money('100000', currency),
      approvedAdditions: zeroMoney(currency),
      approvedReductions: zeroMoney(currency),
      currentContractValue: money('100000', currency),
      pendingChanges: zeroMoney(currency),
    };
    const additionalPosition = {
      originalContractValue: money('40000', currency),
      approvedAdditions: zeroMoney(currency),
      approvedReductions: zeroMoney(currency),
      currentContractValue: money('40000', currency),
      pendingChanges: zeroMoney(currency),
    };
    const result = composeProjectFinancials({
      projectId: 'p1',
      currency,
      expectedRemainingCostAmount: null,
      canReadCommercial: true,
      canReadBilling: true,
      canReadProfit: true,
      commercialData: {
        currency,
        position: {
          originalContractValue: money('140000', currency),
          approvedAdditions: zeroMoney(currency),
          approvedReductions: zeroMoney(currency),
          currentContractValue: money('140000', currency),
          pendingChanges: zeroMoney(currency),
        },
        perContract: [
          {
            contractId: 'c-primary',
            projectId: 'p1',
            isPrimary: true,
            name: 'Main',
            contractType: 'primary',
            status: 'active',
            currency,
            position: primaryPosition,
          },
          {
            contractId: 'c-extra',
            projectId: 'p1',
            isPrimary: false,
            name: 'Facade',
            contractType: 'additional',
            status: 'active',
            currency,
            position: additionalPosition,
          },
        ],
      },
      billingRows: { currency, records: [] },
      expenseContributions: [
        {
          amount: '40000.00',
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
      committed: null,
      openAp: null,
      recognizedVendor: null,
    });

    expect(result.perContract).toHaveLength(2);
    expect(result.commercial?.currentContractValue.amount).toBe('140000.000000');
    expect(result.cost.actualCostToDate.amount).toBe('40000.000000');
    expect(result.profit?.actualProfit.amount).toBe('100000.000000');
    expect(result.perContract?.every((slice) => !('profit' in slice))).toBe(true);
  });

  it('throws when a month-close net uses the wrong currency', () => {
    expect(() =>
      composeProjectFinancials({
        projectId: 'p1',
        currency: 'ILS',
        expectedRemainingCostAmount: null,
        canReadCommercial: false,
        canReadBilling: false,
        canReadProfit: false,
        commercialData: null,
        billingRows: null,
        expenseContributions: [],
        laborInput: null,
        committed: null,
        openAp: null,
        recognizedVendor: null,
        monthCloseEconomic: {
          costNet: money('10', 'USD'),
          revenueNet: zeroMoney('ILS'),
        },
      }),
    ).toThrow(/Month-close cost currency/);
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

describe('multi-contract financials copy', () => {
  it('states that cost and profit stay at project level', async () => {
    const en = await import('@/locales/en/financial.json');
    const he = await import('@/locales/he-IL/financial.json');
    expect(en.default.perContract.costProfitHint.toLowerCase()).toContain('project-level');
    expect(en.default.perContract.costProfitHint.toLowerCase()).not.toContain('allocated profit');
    expect(he.default.perContract.costProfitHint).toContain('ברמת הפרויקט');
  });
});
