import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertIssueCreatesCommittedNotExpense,
  isCommittedCostActualExpense,
} from '@/modules/procurement/domain/committed-cost';
import {
  buildPurchaseOrderInputFromAcceptedQuote,
  compareSupplierQuotesByTotal,
} from '@/modules/procurement/domain/quote-comparison';

describe('compareSupplierQuotesByTotal', () => {
  it('sorts vendor totals ascending within currency (best price first)', () => {
    const sorted = compareSupplierQuotesByTotal([
      {
        quoteId: 'q-high',
        vendorId: 'v1',
        vendorName: 'Alpha',
        currency: 'ILS',
        totalAmount: '500',
        status: 'received',
      },
      {
        quoteId: 'q-low',
        vendorId: 'v2',
        vendorName: 'Beta',
        currency: 'ILS',
        totalAmount: '120.5',
        status: 'received',
      },
      {
        quoteId: 'q-mid',
        vendorId: 'v3',
        vendorName: 'Gamma',
        currency: 'ILS',
        totalAmount: null,
        status: 'shortlisted',
        lineTotalSum: '200',
      },
    ]);

    expect(sorted.map((row) => row.quoteId)).toEqual(['q-low', 'q-mid', 'q-high']);
    expect(sorted[0]?.comparableTotal).toMatch(/^120\.5/);
  });

  it('groups by currency before sorting totals', () => {
    const sorted = compareSupplierQuotesByTotal([
      {
        quoteId: 'usd-2',
        vendorId: 'v1',
        vendorName: 'USD high',
        currency: 'USD',
        totalAmount: '90',
        status: 'received',
      },
      {
        quoteId: 'ils-1',
        vendorId: 'v2',
        vendorName: 'ILS',
        currency: 'ILS',
        totalAmount: '10',
        status: 'received',
      },
      {
        quoteId: 'usd-1',
        vendorId: 'v3',
        vendorName: 'USD low',
        currency: 'USD',
        totalAmount: '10',
        status: 'received',
      },
    ]);

    expect(sorted.map((row) => row.quoteId)).toEqual(['ils-1', 'usd-1', 'usd-2']);
  });
});

describe('buildPurchaseOrderInputFromAcceptedQuote', () => {
  it('maps accepted quote lines to PO committed amount', () => {
    const draft = buildPurchaseOrderInputFromAcceptedQuote({
      id: 'quote-1',
      vendorId: 'vendor-1',
      projectId: 'project-1',
      status: 'accepted',
      currency: 'ILS',
      totalAmount: '150',
      lines: [
        {
          description: 'Cable',
          quantity: '2',
          unitAmount: '50',
          lineTotal: '100',
          currency: 'ILS',
        },
        {
          description: 'Connector',
          quantity: '1',
          unitAmount: '50',
          lineTotal: '50',
          currency: 'ILS',
        },
      ],
      rfqWorkPackageId: 'wp-1',
    });

    expect(draft.supplierQuoteId).toBe('quote-1');
    expect(draft.vendorId).toBe('vendor-1');
    expect(draft.projectId).toBe('project-1');
    expect(draft.workPackageId).toBe('wp-1');
    expect(draft.committedAmount).toMatch(/^150/);
    expect(draft.lines).toHaveLength(2);
    expect(isCommittedCostActualExpense()).toBe(false);
  });

  it('rejects non-accepted quotes', () => {
    expect(() =>
      buildPurchaseOrderInputFromAcceptedQuote({
        id: 'quote-1',
        vendorId: 'vendor-1',
        projectId: null,
        status: 'received',
        currency: 'ILS',
        totalAmount: '10',
        lines: [
          {
            description: 'Item',
            quantity: '1',
            unitAmount: '10',
            lineTotal: '10',
            currency: 'ILS',
          },
        ],
      }),
    ).toThrow(DomainRuleError);
  });

  it('keeps CommittedCost != Expense for quote → PO conversion', () => {
    expect(isCommittedCostActualExpense()).toBe(false);
    expect(() => assertIssueCreatesCommittedNotExpense('issued')).not.toThrow();

    const draft = buildPurchaseOrderInputFromAcceptedQuote({
      id: 'quote-2',
      vendorId: 'vendor-2',
      projectId: null,
      status: 'accepted',
      currency: 'USD',
      totalAmount: null,
      lines: [
        {
          description: 'Panel',
          quantity: '3',
          unitAmount: '40',
          lineTotal: '120',
          currency: 'USD',
        },
      ],
      rfqProjectId: 'proj-fallback',
    });

    expect(draft.projectId).toBe('proj-fallback');
    expect(draft.committedAmount).toMatch(/^120/);
    expect(isCommittedCostActualExpense()).toBe(false);
  });
});
