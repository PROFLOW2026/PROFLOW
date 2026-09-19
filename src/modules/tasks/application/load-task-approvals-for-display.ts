/**
 * Server-side data loader for task approval history.
 */
import 'server-only';

import { desc, eq, and } from 'drizzle-orm';
import { approvalRequests, profiles } from '@drizzle/schema';
import { withOrgContext } from '@/shared/auth/session';

export interface TaskApprovalHistoryRow {
  id: string;
  status: string;
  entityType: string;
  entityId: string;
  decidedAt: Date | null;
  deciderName: string | null;
  reason: string | null;
  createdAt: Date;
}

export async function loadTaskApprovalsForDisplay(
  taskId: string,
): Promise<TaskApprovalHistoryRow[]> {
  return withOrgContext(async (context) => {
    const rows = await context.db
      .select({
        id: approvalRequests.id,
        status: approvalRequests.status,
        entityType: approvalRequests.entityType,
        entityId: approvalRequests.entityId,
        decidedAt: approvalRequests.decidedAt,
        deciderName: profiles.displayName,
        reason: approvalRequests.decisionNote,
        createdAt: approvalRequests.createdAt,
      })
      .from(approvalRequests)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      .leftJoin(profiles, eq(approvalRequests.decidedByUserId as any, profiles.id))
      .where(
        and(
          eq(approvalRequests.entityType, 'task'),
          eq(approvalRequests.entityId, taskId),
          eq(approvalRequests.organizationId, context.organizationId),
        ),
      )
      .orderBy(desc(approvalRequests.createdAt))
      .limit(10);

    return rows.map((row) => ({
      id: row.id,
      status: row.status,
      entityType: row.entityType,
      entityId: row.entityId,
      decidedAt: row.decidedAt,
      deciderName: row.deciderName,
      reason: row.reason,
      createdAt: row.createdAt,
    }));
  });
}
