import { describe, expect, it } from 'vitest';
import {
  expenseCompanyOnlyAmount,
  expenseMissingProjectAllocation,
  resolveExpenseAllocationIntent,
} from '@/modules/financials/domain/allocation-intent';
import { resolveMonthlyAllocationAmounts } from '@/modules/workforce/domain/monthly-allocation';
import { money } from '@/shared/money';

describe('allocation intent — company only vs auto pool', () => {
  it('CASE 1: company_only expense intent is not missing allocation', () => {
    expect(
      expenseMissingProjectAllocation({
        allocationIntent: 'company_only',
        costFamily: 'business_overhead',
        projectId: null,
        hasProjectAllocationLine: false,
      }),
    ).toBe(false);
  });

  it('CASE 2: auto_pool resolves without project lines', () => {
    expect(
      resolveExpenseAllocationIntent({
        explicitIntent: 'auto_pool',
        projectId: null,
        usesAutomaticDriver: false,
        hasProjectAllocationLine: false,
        hasOverheadAllocationLine: false,
        costFamily: 'business_overhead',
      }),
    ).toBe('auto_pool');
  });

  it('CASE 3: manual project + company split uses project_allocate', () => {
    expect(
      resolveExpenseAllocationIntent({
        explicitIntent: 'project_allocate',
        projectId: null,
        usesAutomaticDriver: false,
        hasProjectAllocationLine: true,
        hasOverheadAllocationLine: true,
        costFamily: 'business_overhead',
      }),
    ).toBe('project_allocate');
  });

  it('CASE 5: owner salary 50/30/20 split with company remainder', () => {
    const known = money('40000', 'ILS');
    const resolution = resolveMonthlyAllocationAmounts({
      knownAmount: known,
      method: 'percent',
      remainderAllocationIntent: 'company_only',
      lines: [
        { projectId: 'a', percent: '50' },
        { projectId: 'b', percent: '30' },
      ],
    });
    expect(Number(resolution.allocatedAmount.amount)).toBe(32000);
    expect(Number(resolution.companyOnlyAmount.amount)).toBe(8000);
    expect(Number(resolution.unallocatedAmount.amount)).toBe(0);
  });

  it('CASE 3b: partial project + overhead line keeps project_allocate intent', () => {
    expect(
      resolveExpenseAllocationIntent({
        explicitIntent: 'project_allocate',
        projectId: null,
        usesAutomaticDriver: false,
        hasProjectAllocationLine: true,
        hasOverheadAllocationLine: true,
        costFamily: 'business_overhead',
      }),
    ).toBe('project_allocate');
    expect(
      expenseCompanyOnlyAmount({
        allocationIntent: 'project_allocate',
        netAmount: '10000',
        overheadAllocatedAmount: '2000',
        projectAllocatedAmount: '8000',
      }),
    ).toBe('2000');
  });

  it('shared still requires allocation when project_allocate', () => {
    expect(
      expenseMissingProjectAllocation({
        allocationIntent: 'project_allocate',
        costFamily: 'shared',
        projectId: null,
        hasProjectAllocationLine: false,
      }),
    ).toBe(true);
  });
});
