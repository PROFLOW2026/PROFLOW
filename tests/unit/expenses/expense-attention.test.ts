import { describe, expect, it } from 'vitest';
import {
  countExpensesNeedingAttention,
  expenseAttentionActionHref,
  expenseAttentionFocusParam,
  expenseListShowsAttentionColumns,
  expenseNeedsProjectAllocationFromDetail,
  isExpenseAttentionEligible,
  pickAttentionFilterFromItems,
  resolveExpenseAttentionFilterFromQuery,
  resolveExpenseAttentionRequired,
  resolveExpenseDetailAttention,
} from '@/modules/expenses/domain/expense-attention';
import type { ExpenseDetail, ExpenseSummary } from '@/modules/expenses/domain/types';

function sampleExpense(overrides: Partial<ExpenseSummary> = {}): ExpenseSummary {
  return {
    id: 'exp-1',
    expenseDate: '2026-01-15' as never,
    description: 'Office rent',
    supplierName: 'Landlord',
    vendorId: null,
    vendorName: null,
    projectId: null,
    projectName: null,
    workPackageId: null,
    costFamily: 'business_overhead',
    costCategoryId: 'cat-1',
    classificationStatus: 'classified',
    grossAmount: { amount: '1000', currency: 'ILS' },
    netAmount: { amount: '847.46', currency: 'ILS' },
    taxAmount: { amount: '152.54', currency: 'ILS' },
    status: 'finalized',
    voidsExpenseId: null,
    adjustsExpenseId: null,
    hasActiveReversal: false,
    ...overrides,
  };
}

describe('expense attention eligibility', () => {
  it('maps dashboard deep link unallocated=true to project allocation filter', () => {
    expect(resolveExpenseAttentionFilterFromQuery({ unallocated: true })).toBe('project_allocation');
  });

  it('excludes voided expenses from attention badges and counts', () => {
    const voided = sampleExpense({
      status: 'void',
      needsProjectAllocation: true,
      classificationStatus: 'needs_classification',
    });
    expect(isExpenseAttentionEligible(voided)).toBe(false);
    expect(resolveExpenseAttentionRequired(voided)).toBeNull();
    expect(countExpensesNeedingAttention([voided])).toBe(0);
  });

  it('excludes reversal rows from attention badges and counts', () => {
    const reversal = sampleExpense({
      id: 'rev-1',
      voidsExpenseId: 'exp-original',
      description: 'Reversal: Office rent',
      needsProjectAllocation: true,
      classificationStatus: 'needs_classification',
    });
    expect(isExpenseAttentionEligible(reversal)).toBe(false);
    expect(resolveExpenseAttentionRequired(reversal)).toBeNull();
    expect(countExpensesNeedingAttention([reversal])).toBe(0);
  });

  it('excludes correction replacement rows from attention badges and counts', () => {
    const correction = sampleExpense({
      id: 'adj-1',
      status: 'draft',
      adjustsExpenseId: 'exp-original',
      classificationStatus: 'needs_classification',
    });
    expect(isExpenseAttentionEligible(correction)).toBe(false);
    expect(resolveExpenseAttentionRequired(correction)).toBeNull();
    expect(countExpensesNeedingAttention([correction])).toBe(0);
  });

  it('excludes originals with an active reversal from attention', () => {
    const reversedOriginal = sampleExpense({
      needsProjectAllocation: true,
      hasActiveReversal: true,
    });
    expect(isExpenseAttentionEligible(reversedOriginal)).toBe(false);
    expect(resolveExpenseAttentionRequired(reversedOriginal)).toBeNull();
    expect(countExpensesNeedingAttention([reversedOriginal])).toBe(0);
  });

  it('still flags active unallocated shared expenses', () => {
    const active = sampleExpense({
      costFamily: 'shared',
      needsProjectAllocation: true,
    });
    expect(resolveExpenseAttentionRequired(active)).toBe('project_allocation');
    expect(expenseAttentionActionHref(active.id, 'project_allocation')).toBe(
      '/expenses/exp-1?focus=allocation',
    );
    expect(countExpensesNeedingAttention([active])).toBe(1);
    expect(pickAttentionFilterFromItems([active])).toBe('project_allocation');
  });

  it('does not flag intentional company-only business overhead', () => {
    const companyOnly = sampleExpense({
      costFamily: 'business_overhead',
      needsProjectAllocation: true,
    });
    expect(resolveExpenseAttentionRequired(companyOnly)).toBeNull();
    expect(countExpensesNeedingAttention([companyOnly])).toBe(0);
  });

  it('uses existing draft and classification states only for eligible rows', () => {
    expect(resolveExpenseAttentionRequired(sampleExpense({ status: 'draft' }))).toBe('approval');
    expect(
      resolveExpenseAttentionRequired(
        sampleExpense({ classificationStatus: 'needs_classification' }),
      ),
    ).toBe('classification');
    expect(expenseListShowsAttentionColumns()).toBe(false);
  });
});

function sampleDetail(overrides: Partial<ExpenseDetail> = {}): ExpenseDetail {
  return {
    ...sampleExpense(),
    phaseId: null,
    taxSnapshot: null,
    vatMode: null,
    finalizedAt: null,
    paymentMethod: null,
    notes: null,
    adjustsExpenseId: null,
    isRecurringTemplate: false,
    recurrenceRule: null,
    recurringTemplateId: null,
    createdByUserId: null,
    allocationPeriodStart: null,
    allocationPeriodEnd: null,
    allocationDriverMethod: null,
    allocationScheduleMode: null,
    installmentCount: 1,
    installmentStartDate: null,
    inventoryStockPurchase: false,
    inventoryItemId: null,
    inventoryPurchaseQty: null,
    allocations: [],
    createdAt: new Date('2026-01-15'),
    updatedAt: new Date('2026-01-15'),
    ...overrides,
  };
}

describe('expense detail attention', () => {
  it('maps each actionable condition for the detail page', () => {
    expect(
      resolveExpenseDetailAttention(
        sampleDetail({
          status: 'finalized',
          costFamily: 'shared',
          projectId: null,
          allocations: [{ targetType: 'overhead', projectId: null } as never],
        }),
      ),
    ).toBe('project_allocation');

    expect(
      resolveExpenseDetailAttention(
        sampleDetail({
          status: 'finalized',
          costFamily: 'business_overhead',
          projectId: null,
          allocations: [],
        }),
      ),
    ).toBeNull();

    expect(
      resolveExpenseDetailAttention(
        sampleDetail({ classificationStatus: 'needs_classification' }),
      ),
    ).toBe('classification');

    expect(resolveExpenseDetailAttention(sampleDetail({ status: 'draft' }))).toBe('approval');
  });

  it('does not flag void, reversal, correction, or reversed originals', () => {
    expect(resolveExpenseDetailAttention(sampleDetail({ status: 'void' }))).toBeNull();
    expect(
      resolveExpenseDetailAttention(sampleDetail({ voidsExpenseId: 'exp-original' })),
    ).toBeNull();
    expect(
      resolveExpenseDetailAttention(sampleDetail({ adjustsExpenseId: 'exp-original' })),
    ).toBeNull();
    expect(
      resolveExpenseDetailAttention(sampleDetail(), { hasActiveReversal: true }),
    ).toBeNull();
  });

  it('derives shared project allocation need from detail allocations when list flag is absent', () => {
    expect(
      expenseNeedsProjectAllocationFromDetail(
        sampleDetail({
          status: 'finalized',
          costFamily: 'shared',
          projectId: null,
          allocations: [{ targetType: 'overhead', projectId: null } as never],
        }),
      ),
    ).toBe(true);
    expect(
      expenseNeedsProjectAllocationFromDetail(
        sampleDetail({
          status: 'finalized',
          costFamily: 'business_overhead',
          projectId: null,
          allocations: [],
        }),
      ),
    ).toBe(false);
    expect(
      expenseNeedsProjectAllocationFromDetail(
        sampleDetail({
          status: 'finalized',
          projectId: 'project-1',
          allocations: [],
        }),
      ),
    ).toBe(false);
  });

  it('builds focus deep links for each attention type', () => {
    expect(expenseAttentionFocusParam('project_allocation')).toBe('allocation');
    expect(expenseAttentionFocusParam('classification')).toBe('classification');
    expect(expenseAttentionFocusParam('approval')).toBe('approval');
    expect(expenseAttentionActionHref('exp-1', 'classification')).toBe(
      '/expenses/exp-1?focus=classification',
    );
  });
});
