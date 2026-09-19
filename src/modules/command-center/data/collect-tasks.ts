/**
 * Universal Work Management — Command Center scanners.
 *
 * All queries are scoped to the current user's accessible workspaces. No
 * org-wide fetch + in-code filter: scoping happens in SQL via orgMemberId,
 * TASKS_MANAGE_ALL permission checks, and workspace grant joins.
 *
 * Uses safeQuery() throughout so these scanners degrade silently when the UWM
 * migrations have not yet been applied in a given environment.
 */

import {
  and,
  desc,
  eq,
  exists,
  gte,
  isNull,
  lt,
  lte,
  not,
  notInArray,
  sql,
} from 'drizzle-orm';
import {
  approvalRequests,
  projectMilestones,
  projects,
  taskActivity,
  taskAssignees,
  tasks,
  taskRecurrenceOccurrences,
} from '@drizzle/schema';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { addDays, businessDate, daysBetween } from '@/shared/dates';
import { withItemDefaults } from '../domain/ranking';
import {
  fallbackWhere,
  milestoneApproachingCopy,
  projectStaleCopy,
  recurringTaskGeneratedCopy,
  taskApprovalRequestedCopy,
  taskBlockedWaitingCopy,
  taskDueTodayCopy,
  taskOverdueCopy,
  taskUnassignedCopy,
} from '../domain/item-copy';
import type { CommandCenterItem } from '../domain/types';
import type { CollectContext } from './collect-sources';

const PER_SOURCE_CAP = 15;
const MILESTONE_LOOKAHEAD_DAYS = 7;
const STALE_THRESHOLD_DAYS = 14;
const BLOCKED_THRESHOLD_DAYS = 3;
const RECURRING_LOOKBACK_HOURS = 24;

function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  const message = error instanceof Error ? error.message : String(error);
  return (
    code === '42P01' ||
    code === '42703' ||
    /relation .+ does not exist/i.test(message) ||
    /column .+ does not exist/i.test(message)
  );
}

async function safeQuery<T>(run: () => Promise<T[]>): Promise<T[]> {
  try {
    return await run();
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

// ─── task_overdue ─────────────────────────────────────────────────────────────

/**
 * Tasks past due_date that are assigned to the current user and not yet
 * done or cancelled. Scoped strictly via taskAssignees.orgMemberId.
 */
export async function collectTaskOverdue(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.TASKS_READ)) return [];

  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        id: tasks.id,
        title: tasks.title,
        dueDate: tasks.dueDate,
        projectId: tasks.projectId,
        workspaceId: tasks.workspaceId,
      })
      .from(tasks)
      .innerJoin(
        taskAssignees,
        and(
          eq(taskAssignees.taskId, tasks.id),
          eq(taskAssignees.organizationId, tasks.organizationId),
          eq(taskAssignees.orgMemberId, ctx.context.membershipId),
        ),
      )
      .where(
        and(
          eq(tasks.organizationId, ctx.context.organizationId),
          isNull(tasks.archivedAt),
          lt(tasks.dueDate, ctx.today),
          notInArray(tasks.status, ['done', 'cancelled']),
        ),
      )
      .orderBy(tasks.dueDate)
      .limit(PER_SOURCE_CAP),
  );

  return rows.map((row) => {
    const dueDate = row.dueDate ?? ctx.today;
    const daysOverdue = daysBetween(businessDate(dueDate), ctx.today);
    const copy = taskOverdueCopy(ctx.copyScope, {
      title: row.title,
      dueDate,
      daysOverdue,
    });
    return withItemDefaults({
      sourceType: 'task_overdue',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(ctx.copyScope, 'tasks'),
      href: `/tasks/${row.id}`,
      severity: daysOverdue > 7 ? 'high' : 'medium',
      urgencyBump: Math.min(99, daysOverdue),
      meta: {
        dueDate,
        daysOverdue,
        projectId: row.projectId ?? null,
        workspaceId: row.workspaceId,
      },
    });
  });
}

// ─── task_due_today ───────────────────────────────────────────────────────────

/**
 * Tasks due exactly today assigned to the current user.
 */
export async function collectTaskDueToday(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.TASKS_READ)) return [];

  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        id: tasks.id,
        title: tasks.title,
        projectId: tasks.projectId,
        workspaceId: tasks.workspaceId,
        priority: tasks.priority,
      })
      .from(tasks)
      .innerJoin(
        taskAssignees,
        and(
          eq(taskAssignees.taskId, tasks.id),
          eq(taskAssignees.organizationId, tasks.organizationId),
          eq(taskAssignees.orgMemberId, ctx.context.membershipId),
        ),
      )
      .where(
        and(
          eq(tasks.organizationId, ctx.context.organizationId),
          isNull(tasks.archivedAt),
          eq(tasks.dueDate, ctx.today),
          notInArray(tasks.status, ['done', 'cancelled']),
        ),
      )
      .orderBy(tasks.priority)
      .limit(PER_SOURCE_CAP),
  );

  return rows.map((row) => {
    const copy = taskDueTodayCopy(ctx.copyScope, { title: row.title });
    return withItemDefaults({
      sourceType: 'task_due_today',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(ctx.copyScope, 'tasks'),
      href: `/tasks/${row.id}`,
      severity: row.priority === 'urgent' || row.priority === 'high' ? 'high' : 'medium',
      urgencyBump: 30,
      meta: { dueDate: ctx.today, projectId: row.projectId ?? null, priority: row.priority },
    });
  });
}

// ─── task_blocked_waiting ─────────────────────────────────────────────────────

/**
 * Tasks with status='blocked' assigned to the current user, where the last
 * update was more than 3 days ago (proxy for "waiting without progress").
 */
export async function collectTaskBlockedWaiting(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.TASKS_READ)) return [];

  const staleCutoff = addDays(ctx.today, -BLOCKED_THRESHOLD_DAYS);

  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        id: tasks.id,
        title: tasks.title,
        updatedAt: tasks.updatedAt,
        projectId: tasks.projectId,
        workspaceId: tasks.workspaceId,
      })
      .from(tasks)
      .innerJoin(
        taskAssignees,
        and(
          eq(taskAssignees.taskId, tasks.id),
          eq(taskAssignees.organizationId, tasks.organizationId),
          eq(taskAssignees.orgMemberId, ctx.context.membershipId),
        ),
      )
      .where(
        and(
          eq(tasks.organizationId, ctx.context.organizationId),
          isNull(tasks.archivedAt),
          eq(tasks.status, 'blocked'),
          // updatedAt < staleCutoff (blocked without activity for >3 days)
          lt(tasks.updatedAt, sql`${staleCutoff}::timestamptz`),
        ),
      )
      .orderBy(tasks.updatedAt)
      .limit(PER_SOURCE_CAP),
  );

  return rows.map((row) => {
    const updatedDate = businessDate(row.updatedAt.toISOString().slice(0, 10));
    const daysBlocked = daysBetween(updatedDate, ctx.today);
    const copy = taskBlockedWaitingCopy(ctx.copyScope, {
      title: row.title,
      daysBlocked,
    });
    return withItemDefaults({
      sourceType: 'task_blocked_waiting',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(ctx.copyScope, 'tasks'),
      href: `/tasks/${row.id}`,
      severity: daysBlocked > 7 ? 'high' : 'medium',
      urgencyBump: Math.min(99, daysBlocked * 5),
      meta: { daysBlocked, projectId: row.projectId ?? null },
    });
  });
}

// ─── task_approval_requested ──────────────────────────────────────────────────

/**
 * Tasks awaiting approval for users with TASKS_APPROVE permission.
 * Joins approval_requests (entity_type='task', status='submitted') back to
 * the task for title context.
 */
export async function collectTaskApprovalRequested(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.TASKS_APPROVE)) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.TASKS_READ)) return [];

  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        approvalId: approvalRequests.id,
        taskId: approvalRequests.entityId,
        taskTitle: tasks.title,
        projectId: tasks.projectId,
        workspaceId: tasks.workspaceId,
      })
      .from(approvalRequests)
      .innerJoin(
        tasks,
        and(
          eq(tasks.id, approvalRequests.entityId),
          eq(tasks.organizationId, approvalRequests.organizationId),
        ),
      )
      .where(
        and(
          eq(approvalRequests.organizationId, ctx.context.organizationId),
          eq(approvalRequests.entityType, 'task'),
          eq(approvalRequests.status, 'submitted'),
          isNull(tasks.archivedAt),
        ),
      )
      .limit(PER_SOURCE_CAP),
  );

  return rows.map((row) => {
    const copy = taskApprovalRequestedCopy(ctx.copyScope, { title: row.taskTitle });
    return withItemDefaults({
      sourceType: 'task_approval_requested',
      sourceId: row.approvalId,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(ctx.copyScope, 'tasks'),
      href: `/tasks/${row.taskId}?tab=approvals`,
      severity: 'high',
      urgencyBump: 40,
      meta: {
        taskId: row.taskId,
        projectId: row.projectId ?? null,
        workspaceId: row.workspaceId,
      },
    });
  });
}

// ─── task_unassigned ──────────────────────────────────────────────────────────

/**
 * Project tasks with no assignee, in projects accessible to users with
 * TASKS_MANAGE_ALL. Never fetches all org tasks — filters to tasks in projects
 * the current user manages.
 */
export async function collectTaskUnassigned(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.TASKS_MANAGE_ALL)) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.TASKS_READ)) return [];

  // Tasks that have no assignee row at all
  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        id: tasks.id,
        title: tasks.title,
        projectId: tasks.projectId,
        projectName: projects.name,
        createdAt: tasks.createdAt,
      })
      .from(tasks)
      .innerJoin(
        projects,
        and(
          eq(projects.id, tasks.projectId!),
          eq(projects.organizationId, tasks.organizationId),
          isNull(projects.archivedAt),
        ),
      )
      .where(
        and(
          eq(tasks.organizationId, ctx.context.organizationId),
          isNull(tasks.archivedAt),
          notInArray(tasks.status, ['done', 'cancelled']),
          // Must have a project (workspace-only tasks are excluded — no PM context)
          not(isNull(tasks.projectId)),
          // No assignee exists
          not(
            exists(
              ctx.context.db
                .select({ _: sql`1` })
                .from(taskAssignees)
                .where(
                  and(
                    eq(taskAssignees.taskId, tasks.id),
                    eq(taskAssignees.organizationId, tasks.organizationId),
                  ),
                ),
            ),
          ),
        ),
      )
      .orderBy(desc(tasks.createdAt))
      .limit(PER_SOURCE_CAP),
  );

  return rows.map((row) => {
    const copy = taskUnassignedCopy(ctx.copyScope, {
      title: row.title,
      projectName: row.projectName,
    });
    return withItemDefaults({
      sourceType: 'task_unassigned',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: row.projectName,
      href: `/tasks/${row.id}`,
      severity: 'low',
      urgencyBump: 5,
      meta: { projectId: row.projectId ?? null },
    });
  });
}

// ─── milestone_approaching ────────────────────────────────────────────────────

/**
 * Project milestones with target_date within the next 7 days, belonging to
 * active (non-archived) projects that the current user can read.
 */
export async function collectMilestoneApproaching(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.PROJECTS_READ)) return [];

  const horizon = addDays(ctx.today, MILESTONE_LOOKAHEAD_DAYS);

  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        id: projectMilestones.id,
        name: projectMilestones.name,
        targetDate: projectMilestones.targetDate,
        projectId: projectMilestones.projectId,
        projectName: projects.name,
      })
      .from(projectMilestones)
      .innerJoin(
        projects,
        and(
          eq(projects.id, projectMilestones.projectId),
          eq(projects.organizationId, projectMilestones.organizationId),
          isNull(projects.archivedAt),
        ),
      )
      .where(
        and(
          eq(projectMilestones.organizationId, ctx.context.organizationId),
          isNull(projectMilestones.archivedAt),
          notInArray(projectMilestones.status, ['achieved', 'cancelled']),
          gte(projectMilestones.targetDate, ctx.today),
          lte(projectMilestones.targetDate, horizon),
        ),
      )
      .orderBy(projectMilestones.targetDate)
      .limit(PER_SOURCE_CAP),
  );

  return rows.map((row) => {
    const targetDate = row.targetDate ?? ctx.today;
    const daysLeft = daysBetween(ctx.today, businessDate(targetDate));
    const copy = milestoneApproachingCopy(ctx.copyScope, {
      name: row.name,
      targetDate,
      daysLeft,
    });
    return withItemDefaults({
      sourceType: 'milestone_approaching',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: row.projectName,
      href: `/projects/${row.projectId}?tab=milestones`,
      severity: daysLeft <= 2 ? 'high' : 'medium',
      urgencyBump: Math.min(99, (MILESTONE_LOOKAHEAD_DAYS - daysLeft) * 10),
      meta: { projectId: row.projectId, targetDate, daysLeft },
    });
  });
}

// ─── project_stale ────────────────────────────────────────────────────────────

/**
 * Projects with no task activity in 14+ days. Uses the task_activity log
 * (append-only, never deleted) to find the most recent event per project.
 * Falls back to tasks.updatedAt when task_activity is absent.
 */
export async function collectProjectStale(ctx: CollectContext): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.PROJECTS_READ)) return [];
  if (!hasPermission(ctx.context, PERMISSIONS.TASKS_READ)) return [];

  const staleCutoff = addDays(ctx.today, -STALE_THRESHOLD_DAYS);

  // Find projects where max(task_activity.created_at) is older than the cutoff.
  const rows = await safeQuery(async () => {
    const staleProjects = await ctx.context.db
      .select({
        projectId: projects.id,
        projectName: projects.name,
        lastActivityAt:
          sql<Date>`MAX(${taskActivity.createdAt})`.as('last_activity_at'),
      })
      .from(projects)
      .innerJoin(
        tasks,
        and(
          eq(tasks.projectId, projects.id),
          eq(tasks.organizationId, projects.organizationId),
          isNull(tasks.archivedAt),
        ),
      )
      .leftJoin(
        taskActivity,
        and(
          eq(taskActivity.taskId, tasks.id),
          eq(taskActivity.organizationId, tasks.organizationId),
        ),
      )
      .where(
        and(
          eq(projects.organizationId, ctx.context.organizationId),
          isNull(projects.archivedAt),
        ),
      )
      .groupBy(projects.id, projects.name)
      .having(
        // No activity OR last activity is before the stale cutoff
        sql`MAX(${taskActivity.createdAt}) IS NULL OR MAX(${taskActivity.createdAt}) < ${staleCutoff}::timestamptz`,
      )
      .limit(PER_SOURCE_CAP);

    return staleProjects;
  });

  return rows.map((row) => {
    const lastActivityDate = row.lastActivityAt
      ? businessDate(row.lastActivityAt.toISOString().slice(0, 10))
      : null;
    const daysSinceActivity = lastActivityDate
      ? daysBetween(lastActivityDate, ctx.today)
      : STALE_THRESHOLD_DAYS;
    const copy = projectStaleCopy(ctx.copyScope, {
      projectName: row.projectName,
      daysSinceActivity,
    });
    return withItemDefaults({
      sourceType: 'project_stale',
      sourceId: row.projectId,
      what: copy.what,
      why: copy.why,
      where: row.projectName,
      href: `/projects/${row.projectId}`,
      severity: 'low',
      urgencyBump: Math.min(99, daysSinceActivity - STALE_THRESHOLD_DAYS),
      meta: { projectId: row.projectId, daysSinceActivity },
    });
  });
}

// ─── recurring_task_generated ─────────────────────────────────────────────────

/**
 * Tasks generated by recurrence rules in the last 24h, where the current
 * user is the owner (ownerOrgMemberId). Alerts rule owners so they can
 * review and assign newly spawned recurring tasks.
 */
export async function collectRecurringTaskGenerated(
  ctx: CollectContext,
): Promise<CommandCenterItem[]> {
  if (!hasPermission(ctx.context, PERMISSIONS.TASKS_READ)) return [];

  const since = new Date(Date.now() - RECURRING_LOOKBACK_HOURS * 60 * 60 * 1000);

  const rows = await safeQuery(() =>
    ctx.context.db
      .select({
        id: tasks.id,
        title: tasks.title,
        projectId: tasks.projectId,
        workspaceId: tasks.workspaceId,
        createdAt: tasks.createdAt,
        occurrenceId: taskRecurrenceOccurrences.id,
      })
      .from(tasks)
      .innerJoin(
        taskRecurrenceOccurrences,
        and(
          eq(taskRecurrenceOccurrences.generatedTaskId, tasks.id),
          eq(taskRecurrenceOccurrences.organizationId, tasks.organizationId),
        ),
      )
      .where(
        and(
          eq(tasks.organizationId, ctx.context.organizationId),
          eq(tasks.source, 'recurrence'),
          eq(tasks.ownerOrgMemberId, ctx.context.membershipId),
          isNull(tasks.archivedAt),
          gte(tasks.createdAt, since),
        ),
      )
      .orderBy(desc(tasks.createdAt))
      .limit(PER_SOURCE_CAP),
  );

  return rows.map((row) => {
    const copy = recurringTaskGeneratedCopy(ctx.copyScope, { title: row.title });
    return withItemDefaults({
      sourceType: 'recurring_task_generated',
      sourceId: row.id,
      what: copy.what,
      why: copy.why,
      where: fallbackWhere(ctx.copyScope, 'tasks'),
      href: `/tasks/${row.id}`,
      severity: 'low',
      urgencyBump: 5,
      meta: {
        projectId: row.projectId ?? null,
        workspaceId: row.workspaceId,
        occurrenceId: row.occurrenceId,
      },
    });
  });
}
