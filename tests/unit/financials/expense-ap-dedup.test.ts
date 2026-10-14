import { describe, expect, it } from 'vitest';
import {
  applyLinkedExpenseDeductionsToContributions,
  applyPartialMatchPolicyToRecognizedVendorRollup,
  buildLinkedExpenseDeductions,
  matchedNetFromGross,
} from '@/modules/financials/domain/expense-ap-dedup';
import type { ProjectExpenseContribution } from '@/modules/financials/domain/cost-aggregation';
import { composeProjectFinancials } from '@/modules/financials/application/compose-project-financials';
import { money } from '@/shared/money';

const ILS = 'ILS';

function expenseLine(
  expenseId: string,
  amount: string,
  overrides: Partial<ProjectExpenseContribution> = {},
): ProjectExpenseContribution {
  return {
    amount,
    currency: ILS,
    costFamily: 'direct_project',
    isDirectOnProject: true,
    isAllocated: false,
    isSubcontractor: false,
    projectId: 'p1',
    expenseId,
    ...overrides,
  };
}

describe('expense-ap amount-aware dedupe', () => {
  it('sums accepted match amounts per expense', () => {
    const map = buildLinkedExpenseDeductions(
      [
        { expenseId: 'e1', matchedAmount: '3000', expenseCurrency: ILS },
        { expenseId: 'e1', matchedAmount: '3000', expenseCurrency: ILS },
        { expenseId: 'e2', matchedAmount: '500', expenseCurrency: ILS },
      ],
      ILS,
    );
    expect(map.get('e1')).toBe('6000.000000');
    expect(map.get('e2')).toBe('500.000000');
  });

  it('keeps unmatched expense remainder when bill match is partial (10000 expense, 6000 match)', () => {
    const deductions = new Map([['e1', '6000']]);
    const adjusted = applyLinkedExpenseDeductionsToContributions(
      [expenseLine('e1', '10000')],
      deductions,
    );
    expect(adjusted).toHaveLength(1);
    expect(adjusted[0]!.amount).toBe('4000.000000');
  });

  it('drops expense contribution when match covers full amount', () => {
    const deductions = new Map([['e1', '8000']]);
    const adjusted = applyLinkedExpenseDeductionsToContributions(
      [expenseLine('e1', '8000')],
      deductions,
    );
    expect(adjusted).toHaveLength(0);
  });

  it('caps deduction at expense total and never goes negative', () => {
    const deductions = new Map([['e1', '12000']]);
    const adjusted = applyLinkedExpenseDeductionsToContributions(
      [expenseLine('e1', '10000')],
      deductions,
    );
    expect(adjusted).toHaveLength(0);
  });

  it('compose Actual = expense remainder + recognized bill for partial match', () => {
    const result = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: [expenseLine('linked-expense', '10000')],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: {
        billAmounts: ['6000'],
        total: money('6000', ILS),
        linkedExpenseDeductions: new Map([['linked-expense', '6000']]),
        excludedForeignCurrencyCount: 0,
        billCount: 1,
        recognizedBillIds: ['bill-1'],
        billMatchLinks: [
          { billId: 'bill-1', expenseId: 'linked-expense', matchedAmount: '6000' },
        ],
      },
    });

    expect(result.cost.actualCostToDate.amount).toBe('10000.000000');
    expect(result.cost.vendorActual.amount).toBe('6000.000000');
  });

  it('regression: 10k expense + 10k bill + 6k match must not yield 14k Actual', () => {
    const result = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: [expenseLine('linked-expense', '10000')],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: {
        billAmounts: ['10000'],
        total: money('10000', ILS),
        linkedExpenseDeductions: new Map([['linked-expense', '6000']]),
        excludedForeignCurrencyCount: 0,
        billCount: 1,
        recognizedBillIds: ['bill-1'],
        billMatchLinks: [
          { billId: 'bill-1', expenseId: 'linked-expense', matchedAmount: '6000' },
        ],
      },
    });

    expect(result.cost.actualCostToDate.amount).toBe('10000.000000');
    expect(result.cost.vendorActual.amount).toBe('6000.000000');
  });

  it('compose keeps full bill when expense is smaller than match (6000 expense, 10000 bill, 6000 match)', () => {
    const result = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: [expenseLine('linked-expense', '6000')],
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: {
        billAmounts: ['10000'],
        total: money('10000', ILS),
        linkedExpenseDeductions: new Map([['linked-expense', '6000']]),
        excludedForeignCurrencyCount: 0,
        billCount: 1,
        recognizedBillIds: ['bill-1'],
        billMatchLinks: [
          { billId: 'bill-1', expenseId: 'linked-expense', matchedAmount: '6000' },
        ],
      },
    });

    expect(result.cost.actualCostToDate.amount).toBe('10000.000000');
  });

  it('F02: one bill linked to fully matched A and partial B yields 16k Actual (not 10k cap bug)', () => {
    const contributions = [expenseLine('exp-a', '6000'), expenseLine('exp-b', '10000')];
    const linked = buildLinkedExpenseDeductions(
      [
        {
          expenseId: 'exp-a',
          matchedAmount: '6000',
          expenseCurrency: ILS,
          expenseNetAmount: '6000',
          expenseGrossAmount: '6000',
        },
        {
          expenseId: 'exp-b',
          matchedAmount: '4000',
          expenseCurrency: ILS,
          expenseNetAmount: '10000',
          expenseGrossAmount: '10000',
        },
      ],
      ILS,
    );
    const capped = applyPartialMatchPolicyToRecognizedVendorRollup(
      {
        billAmounts: ['10000'],
        total: money('10000', ILS),
        linkedExpenseDeductions: linked,
        excludedForeignCurrencyCount: 0,
        billCount: 1,
        recognizedBillIds: ['bill-1'],
        billMatchLinks: [
          { billId: 'bill-1', expenseId: 'exp-a', matchedAmount: '6000' },
          { billId: 'bill-1', expenseId: 'exp-b', matchedAmount: '4000' },
        ],
      },
      { currency: ILS, expenseContributions: contributions },
    );

    const result = composeProjectFinancials({
      projectId: 'p1',
      currency: ILS,
      expectedRemainingCostAmount: null,
      canReadCommercial: false,
      canReadBilling: false,
      canReadProfit: false,
      commercialData: null,
      billingRows: null,
      expenseContributions: contributions,
      laborInput: null,
      committed: null,
      openAp: null,
      recognizedVendor: capped,
    });

    expect(result.cost.actualCostToDate.amount).toBe('16000.000000');
  });

  it('F06: matched GROSS converts to NET for deduction (20k/23.6k + 11.8k match)', () => {
    expect(matchedNetFromGross('20000', '23600', '11800', ILS)).toBe('10000.000000');
    const adjusted = applyLinkedExpenseDeductionsToContributions(
      [expenseLine('e1', '20000', {})],
      buildLinkedExpenseDeductions(
        [
          {
            expenseId: 'e1',
            matchedAmount: '11800',
            expenseCurrency: ILS,
            expenseNetAmount: '20000',
            expenseGrossAmount: '23600',
          },
        ],
        ILS,
      ),
    );
    expect(adjusted[0]!.amount).toBe('10000.000000');
  });

  it('F06: zero VAT — 10k/10k + 4k gross match leaves 6k', () => {
    const adjusted = applyLinkedExpenseDeductionsToContributions(
      [expenseLine('e1', '10000')],
      buildLinkedExpenseDeductions(
        [
          {
            expenseId: 'e1',
            matchedAmount: '4000',
            expenseCurrency: ILS,
            expenseNetAmount: '10000',
            expenseGrossAmount: '10000',
          },
        ],
        ILS,
      ),
    );
    expect(adjusted[0]!.amount).toBe('6000.000000');
  });
});
