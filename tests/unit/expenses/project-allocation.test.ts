import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { assertNoAllocationsOnProjectExpense } from '@/modules/expenses/domain/targeting';

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
});
