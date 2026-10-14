import 'server-only';

import { and, eq, ilike, or, sql } from 'drizzle-orm';
import { organizationMemberships, profiles } from '@drizzle/schema';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { findTaskById } from '../data/tasks.repository';
import { resolveAccessibleWorkspaceIds } from './accessible-workspaces';

export interface TaskMentionCandidate {
  readonly orgMemberId: string;
  readonly userId: string;
  readonly displayName: string;
}

/**
 * Org members the caller may @mention on a task (same workspace access as the caller).
 */
export async function searchTaskMentionCandidates(
  context: OrgContext,
  taskId: string,
  query: string,
): Promise<TaskMentionCandidate[]> {
  assertPermission(context, PERMISSIONS.TASKS_COMMENT);

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const workspaceIds = await resolveAccessibleWorkspaceIds(context, {
    workspaceId: task.workspaceId,
  });
  if (!workspaceIds.includes(task.workspaceId)) return [];

  const term = query.trim();
  const like = term ? `%${term}%` : '%';

  const rows = await context.db
    .select({
      orgMemberId: organizationMemberships.id,
      userId: organizationMemberships.userId,
      displayName: profiles.displayName,
    })
    .from(organizationMemberships)
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .where(
      and(
        eq(organizationMemberships.organizationId, context.organizationId),
        sql`EXISTS (
          SELECT 1 FROM workspace_members wm
          WHERE wm.workspace_id = ${task.workspaceId}
            AND wm.org_member_id = ${organizationMemberships.id}
        ) OR EXISTS (
          SELECT 1 FROM workspaces w
          WHERE w.id = ${task.workspaceId}
            AND w.organization_id = ${context.organizationId}
            AND w.workspace_visibility = 'organization'
        )`,
        or(ilike(profiles.displayName, like), ilike(profiles.email, like)),
      ),
    )
    .limit(15);

  return rows
    .filter((row) => row.userId && row.orgMemberId)
    .map((row) => ({
      orgMemberId: row.orgMemberId,
      userId: row.userId!,
      displayName: row.displayName?.trim() || row.userId!,
    }));
}
