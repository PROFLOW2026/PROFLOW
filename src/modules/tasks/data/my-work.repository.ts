import { and, asc, desc, eq, inArray, isNotNull, isNull, lte, gte, or, sql } from 'drizzle-orm';
import { tasks, taskAssignees, taskFollowers } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { clampTaskListLimit, splitTaskListPage } from '../domain/list-window';
import type { Task, TaskStatus, TaskPriority, TaskSource } from '../domain/types';

export type MyWorkView =
  | 'today'
  | 'overdue'
  | 'this_week'
  | 'upcoming'
  | 'waiting'
  | 'assigned_to_me'
  | 'created_by_me'
  | 'following'
  | 'completed'
  | 'no_project';

export interface MyWorkPage {
  readonly tasks: Task[];
  readonly hasMore: boolean;
}

const EMPTY_MY_WORK_PAGE: MyWorkPage = { tasks: [], hasMore: false };

function toMyWorkPage(rows: Array<typeof tasks.$inferSelect>, limit: number): MyWorkPage {
  const split = splitTaskListPage(rows, limit);
  return { tasks: split.items.map(mapTaskRow), hasMore: split.hasMore };
}

function mapTaskRow(row: typeof tasks.$inferSelect): Task {
  return {
    id: row.id,
    organizationId: row.organizationId,
    workspaceId: row.workspaceId,
    boardId: row.boardId ?? null,
    bucketId: row.bucketId ?? null,
    projectId: row.projectId ?? null,
    title: row.title,
    description: row.description ?? null,
    status: row.status as TaskStatus,
    priority: row.priority as TaskPriority,
    startDate: row.startDate ?? null,
    dueDate: row.dueDate ?? null,
    completionDate: row.completionDate ?? null,
    createdByOrgMemberId: row.createdByOrgMemberId ?? null,
    createdByEmployeeId: row.createdByEmployeeId ?? null,
    createdBySystem: row.createdBySystem,
    ownerOrgMemberId: row.ownerOrgMemberId ?? null,
    ownerEmployeeId: row.ownerEmployeeId ?? null,
    estimatedEffortMinutes: row.estimatedEffortMinutes ?? null,
    parentTaskId: row.parentTaskId ?? null,
    sortKey: row.sortKey,
    milestoneId: row.milestoneId ?? null,
    recurrenceRuleId: row.recurrenceRuleId ?? null,
    generatedFromOccurrenceId: row.generatedFromOccurrenceId ?? null,
    source: row.source as TaskSource,
    approvalRequired: row.approvalRequired,
    contributesToProgress: row.contributesToProgress ?? false,
    progressWeight: row.progressWeight ?? null,
    isArchived: row.isArchived,
    archivedAt: row.archivedAt ?? null,
    archivedByOrgMemberId: row.archivedByOrgMemberId ?? null,
    completedByOrgMemberId: row.completedByOrgMemberId ?? null,
    completedByEmployeeId: row.completedByEmployeeId ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function todayISOString(): string {
  return new Date().toISOString().split('T')[0]!;
}

function endOfWeekISOString(): string {
  const d = new Date();
  const dayOfWeek = d.getDay();
  const daysUntilSunday = 7 - dayOfWeek;
  d.setDate(d.getDate() + daysUntilSunday);
  return d.toISOString().split('T')[0]!;
}

function sevenDaysFromNow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  return d.toISOString().split('T')[0]!;
}

export interface MyWorkQueryOptions {
  readonly orgMemberId: string;
  readonly assigneeEmployeeId?: string | null;
  readonly organizationId: string;
  readonly workspaceIds: string[];
  readonly view: MyWorkView;
  readonly limit?: number;
  readonly offset?: number;
}

/**
 * Returns tasks for My Work views.
 * All queries are scoped to caller's accessible workspace IDs.
 */
export async function queryMyWork(
  db: DbExecutor,
  options: MyWorkQueryOptions,
): Promise<Task[]> {
  const page = await queryMyWorkPage(db, options);
  return page.tasks;
}

export async function queryMyWorkPage(
  db: DbExecutor,
  options: MyWorkQueryOptions,
): Promise<MyWorkPage> {
  const { orgMemberId, assigneeEmployeeId, organizationId, workspaceIds, view } = options;
  const limit = clampTaskListLimit(options.limit);
  const offset = options.offset ?? 0;
  const today = todayISOString();

  if (workspaceIds.length === 0) return EMPTY_MY_WORK_PAGE;

  const baseConditions = [
    eq(tasks.organizationId, organizationId),
    inArray(tasks.workspaceId, workspaceIds),
    eq(tasks.isArchived, false),
  ];

  switch (view) {
    case 'today': {
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            eq(tasks.dueDate, today),
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )
        .orderBy(asc(tasks.priority), asc(tasks.sortKey))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'overdue': {
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            isNotNull(tasks.dueDate),
            lte(tasks.dueDate, today),
            sql`${tasks.dueDate} < ${today}`,
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )
        .orderBy(asc(tasks.dueDate), asc(tasks.priority))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'this_week': {
      const endOfWeek = endOfWeekISOString();
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            isNotNull(tasks.dueDate),
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, endOfWeek),
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )
        .orderBy(asc(tasks.dueDate), asc(tasks.priority))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'upcoming': {
      const sevenDays = sevenDaysFromNow();
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            isNotNull(tasks.dueDate),
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, sevenDays),
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )
        .orderBy(asc(tasks.dueDate))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'waiting': {
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            eq(tasks.status, 'blocked'),
          ),
        )
        .orderBy(asc(tasks.dueDate))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'assigned_to_me': {
      const identityConditions = [];
      if (orgMemberId) {
        identityConditions.push(eq(taskAssignees.orgMemberId, orgMemberId));
      }
      if (assigneeEmployeeId) {
        identityConditions.push(eq(taskAssignees.employeeId, assigneeEmployeeId));
      }
      if (identityConditions.length === 0) return EMPTY_MY_WORK_PAGE;

      const assignedTaskIds = await db
        .select({ taskId: taskAssignees.taskId })
        .from(taskAssignees)
        .where(
          and(
            eq(taskAssignees.organizationId, organizationId),
            or(...identityConditions),
          ),
        );
      const ids = [...new Set(assignedTaskIds.map((row) => row.taskId))];
      if (ids.length === 0) return EMPTY_MY_WORK_PAGE;

      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            inArray(tasks.id, ids),
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )
        .orderBy(asc(tasks.dueDate), asc(tasks.priority))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'created_by_me': {
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            eq(tasks.createdByOrgMemberId, orgMemberId),
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )
        .orderBy(desc(tasks.createdAt))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'following': {
      const followedTaskIds = await db
        .select({ taskId: taskFollowers.taskId })
        .from(taskFollowers)
        .where(
          and(
            eq(taskFollowers.orgMemberId, orgMemberId),
            eq(taskFollowers.organizationId, organizationId),
          ),
        );
      const ids = followedTaskIds.map((r) => r.taskId);
      if (ids.length === 0) return EMPTY_MY_WORK_PAGE;

      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            inArray(tasks.id, ids),
          ),
        )
        .orderBy(desc(tasks.updatedAt))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'completed': {
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            eq(tasks.status, 'done'),
          ),
        )
        .orderBy(desc(tasks.completionDate))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'no_project': {
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            isNull(tasks.projectId),
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )
        .orderBy(asc(tasks.dueDate), asc(tasks.priority))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    default: {
      return EMPTY_MY_WORK_PAGE;
    }
  }
}
