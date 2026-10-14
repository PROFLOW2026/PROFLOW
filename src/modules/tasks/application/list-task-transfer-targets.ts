import 'server-only';

import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { listProjects } from '@/modules/projects';
import { listProjectWorkspaceLinksByProject } from '@/modules/workspaces';
import { listBoardsForWorkspace, listBucketsForBoard } from '../data/boards.repository';

export interface TaskTransferBucketOption {
  readonly id: string;
  readonly label: string;
}

export interface TaskTransferBoardOption {
  readonly id: string;
  readonly label: string;
  readonly buckets: readonly TaskTransferBucketOption[];
}

export interface TaskTransferProjectOption {
  readonly id: string;
  readonly label: string;
  readonly boards: readonly TaskTransferBoardOption[];
}

/** Projects, boards, and columns the caller may move or copy tasks into. */
export async function listTaskTransferTargets(
  context: OrgContext,
): Promise<TaskTransferProjectOption[]> {
  assertPermission(context, PERMISSIONS.TASKS_UPDATE);

  const restrictToProjectIds = await resolveAccessibleProjectIds(context);
  const projects = await listProjects(
    context.db,
    context.organizationId,
    { status: 'active' },
    { restrictToProjectIds },
  );

  const options: TaskTransferProjectOption[] = [];

  for (const project of projects) {
    const links = await listProjectWorkspaceLinksByProject(context.db, project.id);
    if (links.length === 0) continue;

    const workspaceId = links[0]!.workspaceId;
    const boards = await listBoardsForWorkspace(context.db, context.organizationId, workspaceId, false);
    const boardOptions: TaskTransferBoardOption[] = [];

    for (const board of boards) {
      const buckets = await listBucketsForBoard(context.db, context.organizationId, board.id);
      boardOptions.push({
        id: board.id,
        label: board.name,
        buckets: buckets.map((bucket) => ({
          id: bucket.id,
          label: bucket.name,
        })),
      });
    }

    options.push({
      id: project.id,
      label: project.name,
      boards: boardOptions,
    });
  }

  return options;
}
