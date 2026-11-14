import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { hasAnyPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveProjectGoalsCapabilities } from '../domain/permissions';
import type { ProjectGoalListItem } from '../ui/project-goals-panel';
import { listProjectGoals } from './list-project-goals';

export interface ProjectGoalsPanelData {
  readonly items: readonly ProjectGoalListItem[];
  readonly canUpdate: boolean;
  readonly viewOnly: boolean;
}

/**
 * Shared loader for main + employee goals pages.
 * Capability flags come from the pure resolver — not from app-type checks.
 * `listProjectGoals` enforces `project.view`; edit uses projects.update | planning.write.
 */
export async function loadInternalProjectGoalsPanelData(
  context: OrgContext,
  projectId: string,
): Promise<ProjectGoalsPanelData> {
  const canMutateGoals = hasAnyPermission(context, [
    PERMISSIONS.PROJECTS_UPDATE,
    PERMISSIONS.PLANNING_WRITE,
  ]);
  const caps = resolveProjectGoalsCapabilities({
    actorKind: 'internal',
    canAccessProject: true,
    canMutateGoals,
  });

  const goals = await listProjectGoals(context, projectId);
  const items: ProjectGoalListItem[] = goals.map((row) => ({
    id: row.id,
    title: row.title,
    dueOn: row.dueOn,
    status: row.status,
    progressPercent: row.progressPercent,
  }));

  return {
    items,
    canUpdate: caps.canEdit,
    viewOnly: caps.viewOnly,
  };
}
