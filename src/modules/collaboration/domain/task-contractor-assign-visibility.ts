/**
 * Visibility for the shared task contractor section.
 * canManage is the existing project capability tasks.manage. No second capability.
 * A task with no project stays hidden. The contractor portal task page is the
 * assignee work view and does not render this section, so it does not assign.
 */
export interface TaskContractorAssignVisibility {
  readonly eligible: boolean;
  readonly projectId: string | null;
  readonly canManage: boolean;
  readonly hasAssignment: boolean;
}

export function showTaskContractorAssignForm(input: TaskContractorAssignVisibility): boolean {
  return input.eligible && Boolean(input.projectId) && input.canManage && !input.hasAssignment;
}
