import {
  and,
  asc,
  desc,
  eq,
  getTableColumns,
  inArray,
  isNotNull,
  isNull,
  lte,
  gte,
  or,
  sql,
} from 'drizzle-orm';
import { tasks, taskAssignees, taskFollowers } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { addDays, type BusinessDate } from '@/shared/dates';
import { clampTaskListLimit, splitTaskListPage } from '../domain/list-window';
import type { Task, TaskStatus, TaskPriority, TaskSource } from '../domain/types';

import type { MyWorkView } from '../domain/my-work-view';

export type { MyWorkView };

export interface MyWorkPage {
  readonly tasks: Task[];
  readonly hasMore: boolean;
}

const EMPTY_MY_WORK_PAGE: MyWorkPage = { tasks: [], hasMore: false };
const taskColumns = getTableColumns(tasks);

/** Upcoming Sunday from org calendar day (legacy My Work "this week" upper bound). */
function upcomingSundayFrom(today: BusinessDate): BusinessDate {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const daysUntilSunday = weekday === 0 ? 7 : 7 - weekday;
  return addDays(today, daysUntilSunday);
}

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
    generatedFromOrgProjectTaskTemplateId: row.generatedFromOrgProjectTaskTemplateId ?? null,
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

export interface MyWorkQueryOptions {
  readonly orgMemberId: string;
  readonly assigneeEmployeeId?: string | null;
  readonly organizationId: string;
  readonly workspaceIds: string[];
  readonly view: MyWorkView;
  /** Org-timezone calendar day (YYYY-MM-DD) for date-bound views. */
  readonly today: string;
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
  const { orgMemberId, assigneeEmployeeId, organizationId, workspaceIds, view, today } = options;
  const limit = clampTaskListLimit(options.limit);
  const offset = options.offset ?? 0;
  const todayDate = today as BusinessDate;

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
      const endOfWeekDate = upcomingSundayFrom(todayDate);
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            isNotNull(tasks.dueDate),
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, endOfWeekDate),
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )
        .orderBy(asc(tasks.dueDate), asc(tasks.priority))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'upcoming': {
      const upcomingEnd = addDays(todayDate, 14);
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            isNotNull(tasks.dueDate),
            gte(tasks.dueDate, today),
            lte(tasks.dueDate, upcomingEnd),
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

      const rows = await db
        .selectDistinctOn([tasks.id], taskColumns)
        .from(tasks)
        .innerJoin(
          taskAssignees,
          and(
            eq(taskAssignees.taskId, tasks.id),
            eq(taskAssignees.organizationId, organizationId),
          ),
        )
        .where(
          and(
            ...baseConditions,
            or(...identityConditions),
            sql`${tasks.status} NOT IN ('done', 'cancelled')`,
          ),
        )
        .orderBy(tasks.id, asc(tasks.dueDate), asc(tasks.priority))
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
      const rows = await db
        .selectDistinctOn([tasks.id], taskColumns)
        .from(tasks)
        .innerJoin(
          taskFollowers,
          and(
            eq(taskFollowers.taskId, tasks.id),
            eq(taskFollowers.organizationId, organizationId),
            eq(taskFollowers.orgMemberId, orgMemberId),
          ),
        )
        .where(and(...baseConditions))
        .orderBy(tasks.id, desc(tasks.updatedAt))
        .limit(limit + 1)
        .offset(offset);
      return toMyWorkPage(rows, limit);
    }

    case 'completed': {
      const completedSince = addDays(todayDate, -30);
      const rows = await db
        .select()
        .from(tasks)
        .where(
          and(
            ...baseConditions,
            eq(tasks.status, 'done'),
            isNotNull(tasks.completionDate),
            gte(tasks.completionDate, completedSince),
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
