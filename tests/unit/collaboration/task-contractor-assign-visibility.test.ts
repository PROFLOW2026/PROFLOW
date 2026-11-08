import { describe, expect, it } from 'vitest';
import { showTaskContractorAssignForm } from '@/modules/collaboration/domain/task-contractor-assign-visibility';

const visible = {
  eligible: true,
  projectId: 'project-1',
  canManage: true,
  hasAssignment: false,
};

describe('task contractor assign form visibility', () => {
  it('shows the form when the task is eligible, on a project, manageable, and unassigned', () => {
    expect(showTaskContractorAssignForm(visible)).toBe(true);
  });

  it.each([
    ['the task is not eligible', { eligible: false }],
    ['the task has no project', { projectId: null }],
    ['the project id is blank', { projectId: '' }],
    ['the user cannot manage tasks', { canManage: false }],
    ['the task is already assigned', { hasAssignment: true }],
  ] as const)('hides the form when %s', (_label, patch) => {
    expect(showTaskContractorAssignForm({ ...visible, ...patch })).toBe(false);
  });
});
