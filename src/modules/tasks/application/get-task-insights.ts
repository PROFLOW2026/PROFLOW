import 'server-only';

import { and, desc, eq, inArray, isNull, lt, lte, gte, sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { getAccessibleWorkspaceIds } from '@/modules/operations';
import { tasks, taskAssignees, employees } from '@drizzle/schema';
import type { TaskStatus } from '../domain/types';
import { addDays, todayInTimeZone } from '@/shared/dates';

export interface TaskInsightsAssigneeRow {
  readonly assigneeId: string;
  readonly assigneeName: string;
  readonly openCount: number;
}

export interface TaskInsightsProjectRow {
  readonly projectId: string | null;
  readonly projectName: string;
  readonly openCount: number;
}

export interface TaskInsights {
  readonly byStatus: Readonly<Record<TaskStatus, number>>;
  readonly overdue: number;
  readonly completed: number;
  readonly blocked: number;
  readonly dueThisWeek: number;
  readonly totalOpen: number;
  readonly byAssignee: readonly TaskInsightsAssigneeRow[];
  readonly byProject: readonly TaskInsightsProjectRow[];
}

const OPEN_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'blocked'];

/**
 * Task statistics from the canonical tasks table.
 * Access-scoped; no financial data.
 */
export async function getTaskInsights(context: OrgContext): Promise<TaskInsights> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const [accessibleProjectIds, accessibleWorkspaceIds] = await Promise.all([
    resolveAccessibleProjectIds(context),
    getAccessibleWorkspaceIds(context.db, context.organizationId, context.membershipId),
  ]);

  if (accessibleWorkspaceIds.length === 0) {
    return emptyInsights();
  }

  const today = todayInTimeZone(context.organization.timezone);
  const weekEnd = addDays(today, 7);

  const baseConditions = [
    eq(tasks.organizationId, context.organizationId),
    inArray(tasks.workspaceId, accessibleWorkspaceIds),
    isNull(tasks.archivedAt),
  ];

  if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) {
      baseConditions.push(isNull(tasks.projectId));
    } else {
      baseConditions.push(
        sql`(${tasks.projectId} IS NULL OR ${tasks.projectId} = ANY(${accessibleProjectIds}))`,
      );
    }
  }

  const [statusRows, overdueRow, completedRow, blockedRow, dueWeekRow, assigneeRows, projectRows] =
    await Promise.all([
      context.db
        .select({
          status: tasks.status,
          count: sql<number>`count(*)::int`,
        })
        .from(tasks)
        .where(and(...baseConditions, inArray(tasks.status, OPEN_STATUSES)))
        .groupBy(tasks.status),

      context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            inArray(tasks.status, OPEN_STATUSES),
            lt(tasks.dueDate, today),
          ),
        ),

      context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(...baseConditions, eq(tasks.status, 'done'))),

      context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(and(...baseConditions, eq(tasks.status, 'blocked'))),

      context.db
        .select({ count: sql<number>`count(*)::int` })
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            inArray(tasks.status, OPEN_STATUSES),
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, weekEnd),
          ),
        ),

      context.db
        .select({
          assigneeId: employees.id,
          assigneeName: employees.name,
          openCount: sql<number>`count(*) filter (where ${tasks.status} in ('todo','in_progress','in_review','blocked'))::int`,
        })
        .from(taskAssignees)
        .innerJoin(tasks, and(eq(tasks.id, taskAssignees.taskId), isNull(tasks.archivedAt)))
        .innerJoin(employees, eq(employees.id, taskAssignees.employeeId))
        .where(
          and(
            eq(tasks.organizationId, context.organizationId),
            inArray(tasks.workspaceId, accessibleWorkspaceIds),
            inArray(tasks.status, OPEN_STATUSES),
          ),
        )
        .groupBy(employees.id, employees.name)
        .orderBy(
          desc(
            sql`count(*) filter (where ${tasks.status} in ('todo','in_progress','in_review','blocked'))`,
          ),
        )
        .limit(10),

      context.db
        .select({
          projectId: tasks.projectId,
          projectName: sql<string>`coalesce((select p.name from projects p where p.id = ${tasks.projectId}), '—')`,
          openCount: sql<number>`count(*) filter (where ${tasks.status} in ('todo','in_progress','in_review','blocked'))::int`,
        })
        .from(tasks)
        .where(and(...baseConditions, inArray(tasks.status, OPEN_STATUSES)))
        .groupBy(tasks.projectId)
        .orderBy(
          desc(
            sql`count(*) filter (where ${tasks.status} in ('todo','in_progress','in_review','blocked'))`,
          ),
        )
        .limit(10),
    ]);

  const byStatus = emptyStatusCounts();
  let totalOpen = 0;
  for (const row of statusRows) {
    byStatus[row.status as TaskStatus] = row.count;
    totalOpen += row.count;
  }

  return {
    byStatus,
    overdue: overdueRow[0]?.count ?? 0,
    completed: completedRow[0]?.count ?? 0,
    blocked: blockedRow[0]?.count ?? 0,
    dueThisWeek: dueWeekRow[0]?.count ?? 0,
    totalOpen,
    byAssignee: assigneeRows.map((r) => ({
      assigneeId: r.assigneeId,
      assigneeName: r.assigneeName,
      openCount: r.openCount,
    })),
    byProject: projectRows.map((r) => ({
      projectId: r.projectId,
      projectName: r.projectName,
      openCount: r.openCount,
    })),
  };
}

function emptyStatusCounts(): Record<TaskStatus, number> {
  return {
    todo: 0,
    in_progress: 0,
    in_review: 0,
    blocked: 0,
    done: 0,
    cancelled: 0,
  };
}

function emptyInsights(): TaskInsights {
  return {
    byStatus: emptyStatusCounts(),
    overdue: 0,
    completed: 0,
    blocked: 0,
    dueThisWeek: 0,
    totalOpen: 0,
    byAssignee: [],
    byProject: [],
  };
}
