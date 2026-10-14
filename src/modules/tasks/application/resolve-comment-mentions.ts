import 'server-only';

import { and, eq, inArray, isNotNull } from 'drizzle-orm';
import { organizationMemberships, workspaceMembers, workspaces } from '@drizzle/schema';
import { ValidationError, NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { extractMentionOrgMemberIds } from '../domain/comment-mentions';
import { findTaskById } from '../data/tasks.repository';
import { resolveAccessibleWorkspaceIds } from './accessible-workspaces';

export async function resolveMentionedUserIdsForComment(
  context: OrgContext,
  taskId: string,
  body: string,
): Promise<string[]> {
  const memberIds = extractMentionOrgMemberIds(body);
  if (memberIds.length === 0) return [];

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const workspaceIds = await resolveAccessibleWorkspaceIds(context, {
    workspaceId: task.workspaceId,
  });
  if (!workspaceIds.includes(task.workspaceId)) {
    throw new ValidationError([{ path: 'body', message: 'Mention includes users without task access' }]);
  }

  const [workspace] = await context.db
    .select({ visibility: workspaces.workspaceVisibility })
    .from(workspaces)
    .where(
      and(
        eq(workspaces.id, task.workspaceId),
        eq(workspaces.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  const orgWideMentions = workspace?.visibility === 'organization';

  if (!orgWideMentions) {
    const memberRows = await context.db
      .select({ orgMemberId: workspaceMembers.orgMemberId })
      .from(workspaceMembers)
      .where(
        and(
          eq(workspaceMembers.workspaceId, task.workspaceId),
          eq(workspaceMembers.organizationId, context.organizationId),
          inArray(workspaceMembers.orgMemberId, memberIds),
          isNotNull(workspaceMembers.orgMemberId),
        ),
      );
    const allowed = new Set(
      memberRows.map((row) => row.orgMemberId).filter((id): id is string => Boolean(id)),
    );
    if (memberIds.some((id) => !allowed.has(id))) {
      throw new ValidationError([
        { path: 'body', message: 'Mention includes users without task access' },
      ]);
    }
  }

  const rows = await context.db
    .select({ orgMemberId: organizationMemberships.id, userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, context.organizationId),
        inArray(organizationMemberships.id, memberIds),
      ),
    );

  if (rows.length !== memberIds.length) {
    throw new ValidationError([{ path: 'body', message: 'Mention includes users without task access' }]);
  }

  return rows.map((row) => row.userId).filter((id): id is string => Boolean(id));
}
