import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { resolveExpenseTargeting, isOverheadTargeting } from '@/modules/expenses/domain/targeting';

describe('expense targeting', () => {
  it('defaults to business overhead when no project is selected', () => {
    const targeting = resolveExpenseTargeting({});
    expect(targeting.mode).toBe('overhead');
    expect(targeting.costFamily).toBe('business_overhead');
    expect(isOverheadTargeting(targeting)).toBe(true);
  });

  it('defaults to direct project cost when a project is selected', () => {
    const targeting = resolveExpenseTargeting({ projectId: 'project-1' });
    expect(targeting.mode).toBe('project');
    expect(targeting.costFamily).toBe('direct_project');
    expect(targeting.projectId).toBe('project-1');
  });

  it('rejects work package without project', () => {
    expect(() => resolveExpenseTargeting({ workPackageId: 'wp-1' })).toThrow(DomainRuleError);
  });

  it('rejects business overhead family on a project expense', () => {
    expect(() =>
      resolveExpenseTargeting({ projectId: 'p1', costFamily: 'business_overhead' }),
    ).toThrow(DomainRuleError);
  });

  it('allows shared cost family on a project expense', () => {
    const targeting = resolveExpenseTargeting({ projectId: 'p1', costFamily: 'shared' });
    expect(targeting.costFamily).toBe('shared');
  });
});
