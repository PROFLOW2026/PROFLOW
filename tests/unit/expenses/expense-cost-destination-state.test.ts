import { describe, expect, it } from 'vitest';
import {
  isProjectIdInOptions,
  resolveRestoredSingleProjectId,
  shouldConfirmLeavingSingleProject,
} from '@/modules/expenses/domain/expense-cost-destination-state';

describe('expense-cost-destination-state', () => {
  const ids = ['p1', 'p2'] as const;

  it('resolveRestoredSingleProjectId returns remembered when still in list', () => {
    expect(resolveRestoredSingleProjectId('p2', ids)).toBe('p2');
  });

  it('resolveRestoredSingleProjectId returns null when project not allowed', () => {
    expect(resolveRestoredSingleProjectId('p-missing', ids)).toBeNull();
    expect(resolveRestoredSingleProjectId('', ids)).toBeNull();
  });

  it('shouldConfirmLeavingSingleProject only when leaving single with header project', () => {
    expect(
      shouldConfirmLeavingSingleProject('project_single', 'auto_pool', 'p1'),
    ).toBe(true);
    expect(
      shouldConfirmLeavingSingleProject('project_single', 'project_multi', 'p1'),
    ).toBe(true);
    expect(
      shouldConfirmLeavingSingleProject('project_single', 'project_single', 'p1'),
    ).toBe(false);
    expect(shouldConfirmLeavingSingleProject('auto_pool', 'company_only', 'p1')).toBe(
      false,
    );
    expect(shouldConfirmLeavingSingleProject('project_single', 'auto_pool', null)).toBe(
      false,
    );
  });

  it('isProjectIdInOptions', () => {
    expect(isProjectIdInOptions('p1', ids)).toBe(true);
    expect(isProjectIdInOptions('  ', ids)).toBe(false);
  });
});
