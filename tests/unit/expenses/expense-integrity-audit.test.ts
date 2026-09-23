import { describe, expect, it } from 'vitest';
import { resolveExpenseAllocationIntent } from '@/modules/financials/domain/allocation-intent';

describe('expense integrity inference', () => {
  it('infers project_allocate from multi-project lines without top-level projectId', () => {
    expect(
      resolveExpenseAllocationIntent({
        explicitIntent: null,
        projectId: null,
        usesAutomaticDriver: false,
        hasProjectAllocationLine: true,
        hasOverheadAllocationLine: false,
        costFamily: 'direct_project',
      }),
    ).toBe('project_allocate');
  });

  it('infers company_only from overhead-only routing', () => {
    expect(
      resolveExpenseAllocationIntent({
        explicitIntent: 'company_only',
        projectId: null,
        usesAutomaticDriver: false,
        hasProjectAllocationLine: false,
        hasOverheadAllocationLine: true,
        costFamily: 'business_overhead',
      }),
    ).toBe('company_only');
  });
});
