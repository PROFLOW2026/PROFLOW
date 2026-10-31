import { describe, expect, it } from 'vitest';
import {
  countExpensesNeedingAttention,
  isExpenseAttentionEligible,
  listExpenseAttentionRequired,
  resolveExpenseAttentionRequired,
} from '@/modules/expenses/domain/expense-attention';
import type { ExpenseSummary } from '@/modules/expenses/domain/types';

/**
 * Repository SQL uses the same lifecycle exclusions as domain helpers
 * (see appendExpenseAttentionEligibilityConditions in expenses.repository.ts).
 * These cases must stay aligned so bell/count/list filters match row badges.
 */
function sample(overrides: Partial<ExpenseSummary> = {}): ExpenseSummary {
  return {
    id: 'exp-1',
    expenseDate: '2026-10-11' as never,
    description: 'Test',
    supplierName: 'Vendor',
    vendorId: null,
    vendorName: null,
    projectId: 'proj-1',
    projectName: 'Project',
    workPackageId: null,
    costFamily: 'business_overhead',
    costCategoryId: null,
    classificationStatus: 'needs_classification',
    grossAmount: { amount: '245', currency: 'ILS' },
    netAmount: { amount: '207.63', currency: 'ILS' },
    taxAmount: { amount: '37.37', currency: 'ILS' },
    status: 'finalized',
    voidsExpenseId: null,
    adjustsExpenseId: null,
    hasActiveReversal: false,
    ...overrides,
  };
}

describe('expense attention SQL parity (domain reference)', () => {
  it('void + needs_classification is not eligible (Production case c7cb968d…)', () => {
    const voided = sample({ status: 'void' });
    expect(isExpenseAttentionEligible(voided)).toBe(false);
    expect(listExpenseAttentionRequired(voided)).toEqual([]);
    expect(resolveExpenseAttentionRequired(voided)).toBeNull();
    expect(countExpensesNeedingAttention([voided, sample()])).toBe(1);
  });

  it('active finalized + needs_classification remains actionable', () => {
    const active = sample({ status: 'finalized', classificationStatus: 'needs_classification' });
    expect(isExpenseAttentionEligible(active)).toBe(true);
    expect(resolveExpenseAttentionRequired(active)).toBe('classification');
  });

  it('draft approval path stays eligible', () => {
    const draft = sample({ status: 'draft', classificationStatus: 'classified' });
    expect(resolveExpenseAttentionRequired(draft)).toBe('approval');
  });
});
