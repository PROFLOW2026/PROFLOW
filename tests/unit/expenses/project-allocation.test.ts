import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertNoAllocationsOnProjectExpense,
  expenseHasProjectAttribution,
} from '@/modules/expenses/domain/targeting';

describe('project expense allocations', () => {
  it('rejects allocation lines on a project-targeted expense', () => {
    expect(() =>
      assertNoAllocationsOnProjectExpense('project', [{ targetType: 'project', projectId: 'p1' }]),
    ).toThrow(DomainRuleError);
  });

  it('allows allocation lines on overhead expenses', () => {
    expect(() =>
      assertNoAllocationsOnProjectExpense('overhead', [{ targetType: 'project', projectId: 'p1' }]),
    ).not.toThrow();
  });

  it('allows project expenses without allocation lines', () => {
    expect(() => assertNoAllocationsOnProjectExpense('project', [])).not.toThrow();
  });

  it('detects project attribution from top-level project or allocation lines', () => {
    expect(expenseHasProjectAttribution({ projectId: 'p1' })).toBe(true);
    expect(
      expenseHasProjectAttribution({
        allocations: [{ targetType: 'project', projectId: 'p2' }],
      }),
    ).toBe(true);
    expect(expenseHasProjectAttribution({})).toBe(false);
    expect(
      expenseHasProjectAttribution({
        allocations: [{ targetType: 'overhead', projectId: null }],
      }),
    ).toBe(false);
  });
});
