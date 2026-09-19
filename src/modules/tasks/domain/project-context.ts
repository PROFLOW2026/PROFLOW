/**
 * Project context validation (UWM architectural rule C).
 *
 * If a task has a project_id, a project_workspace_links row MUST exist for
 * (workspace_id, project_id). This is enforced at the application layer on
 * createTask and updateTask.
 */

import { DomainRuleError } from '@/shared/errors';

export interface ProjectContextLink {
  readonly workspaceId: string;
  readonly projectId: string;
}

/**
 * Validates that when projectId is provided, the (workspaceId, projectId)
 * pair exists in the provided links array.
 *
 * @param workspaceId  The task's workspace
 * @param projectId    The task's project attribution (may be null — no validation needed)
 * @param links        All project_workspace_links for this workspace (fetched by caller)
 */
export function validateProjectContext(
  workspaceId: string,
  projectId: string | null | undefined,
  links: readonly ProjectContextLink[],
): void {
  if (!projectId) return; // NULL project_id is always valid

  const hasLink = links.some(
    (l) => l.workspaceId === workspaceId && l.projectId === projectId,
  );

  if (!hasLink) {
    throw new DomainRuleError(
      `Project ${projectId} is not linked to workspace ${workspaceId}. ` +
        'Create a project_workspace_links record first.',
      'tasks.errors.projectNotLinkedToWorkspace',
      { workspaceId, projectId },
    );
  }
}
