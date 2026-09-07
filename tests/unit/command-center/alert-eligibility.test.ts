import { describe, expect, it } from 'vitest';
import { timeEntryRequiresProjectAttribution } from '@/modules/workforce/application/labor-allocation-alerts';
import { expenseRowRequiresProjectAllocation } from '@/modules/expenses/domain/expense-allocation-attention';

describe('timeEntryRequiresProjectAttribution', () => {
  it('returns false for approved project time with project id', () => {
    expect(
      timeEntryRequiresProjectAttribution({
        kind: 'project',
        projectId: 'proj-1',
        hours: '8',
      }),
    ).toBe(false);
  });

  it('returns true for non_project work when employee expects project allocation', () => {
    expect(
      timeEntryRequiresProjectAttribution({
        kind: 'non_project',
        projectId: null,
        hours: '8',
      }),
    ).toBe(true);
  });

  it('returns true for project kind missing project id', () => {
    expect(
      timeEntryRequiresProjectAttribution({
        kind: 'project',
        projectId: null,
        hours: '4',
      }),
    ).toBe(true);
  });

  it('returns false for zero hours', () => {
    expect(
      timeEntryRequiresProjectAttribution({
        kind: 'non_project',
        projectId: null,
        hours: '0',
      }),
    ).toBe(false);
  });
});

describe('expenseRowRequiresProjectAllocation', () => {
  it('does not require allocation for business overhead without project', () => {
    expect(
      expenseRowRequiresProjectAllocation({
        status: 'finalized',
        projectId: null,
        costFamily: 'business_overhead',
        inventoryStockPurchase: false,
        hasProjectAllocationLine: false,
      }),
    ).toBe(false);
  });

  it('requires allocation for shared cost without project line', () => {
    expect(
      expenseRowRequiresProjectAllocation({
        status: 'finalized',
        projectId: null,
        costFamily: 'shared',
        inventoryStockPurchase: false,
        hasProjectAllocationLine: false,
      }),
    ).toBe(true);
  });
});
