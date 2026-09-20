/**
 * Operations Dashboard — SQL-scoped data repository.
 *
 * CRITICAL: All counts are scoped to caller-accessible data.
 * - Task counts: filtered by workspace access + project-context access
 * - NEVER compute org-wide totals and hide inaccessible counts
 */

import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  approvalRequests,
  employees,
  projectMilestones,
  projects,
  tasks,
  taskActivity,
  taskAssignees,
  workspaces,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ActiveProjectStats {
  activeCount: number;
  byStage: readonly { stageName: string; count: number }[];
}

export interface TaskCountStats {
  dueToday: number;
  overdue: number;
  blocked: number;
}

export interface UpcomingMilestone {
  id: string;
  name: string;
  projectId: string;
  projectName: string;
  dueDate: string;
}

export interface StaleProject {
  id: string;
  name: string;
  status: string;
  lastActivityAt: Date | null;
}

export interface WorkloadEntry {
  employeeId: string;
  employeeName: string;
  openTaskCount: number;
}

export interface RecentActivityEvent {
  id: string;
  taskId: string;
  taskTitle: string;
  eventType: string;
  occurredAt: Date;
  workspaceName: string | null;
  projectName: string | null;
}

// ─── Active Projects ──────────────────────────────────────────────────────────

export async function getActiveProjectStats(
  db: DbExecutor,
  organizationId: string,
  accessibleProjectIds: string[] | null,
): Promise<ActiveProjectStats> {
  const orgCondition = eq(projects.organizationId, organizationId);
  const statusCondition = eq(projects.status, 'active');
  const archivedCondition = isNull(projects.archivedAt);

  const conditions = [orgCondition, statusCondition, archivedCondition];
  if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) {
      return { activeCount: 0, byStage: [] };
    }
    conditions.push(inArray(projects.id, accessibleProjectIds));
  }

  // Total active project count
  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(and(...conditions));

  // Projects by progressStatus (on_track, at_risk, delayed, etc.)
  const stageRows = await db
    .select({
      stageName: projects.progressStatus,
      count: sql<number>`count(*)::int`,
    })
    .from(projects)
    .where(and(...conditions))
    .groupBy(projects.progressStatus)
    .orderBy(desc(sql<number>`count(*)`));

  return {
    activeCount: countRow?.count ?? 0,
    byStage: stageRows.map((r) => ({
      stageName: r.stageName ?? 'No Status',
      count: r.count,
    })),
  };
}

// ─── Task Counts ──────────────────────────────────────────────────────────────

export async function getAccessibleTaskCounts(
  db: DbExecutor,
  organizationId: string,
  accessibleWorkspaceIds: string[],
  accessibleProjectIds: string[] | null,
): Promise<TaskCountStats> {
  if (accessibleWorkspaceIds.length === 0) {
    return { dueToday: 0, overdue: 0, blocked: 0 };
  }

  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const activeStatuses = ['todo', 'in_progress', 'in_review', 'blocked'] as const;

  const baseConditions = [
    eq(tasks.organizationId, organizationId),
    inArray(tasks.workspaceId, accessibleWorkspaceIds),
    inArray(tasks.status, [...activeStatuses]),
    isNull(tasks.archivedAt),
  ];

  // Apply project-context filter when access is restricted
  // (tasks without a project are always visible within accessible workspaces)
  if (accessibleProjectIds !== null && accessibleProjectIds.length > 0) {
    // include tasks with no project OR tasks in accessible projects
    baseConditions.push(
      sql`(${tasks.projectId} IS NULL OR ${tasks.projectId} = ANY(${accessibleProjectIds}))`,
    );
  } else if (accessibleProjectIds !== null && accessibleProjectIds.length === 0) {
    // no accessible projects — only show workspace-wide (no-project) tasks
    baseConditions.push(isNull(tasks.projectId));
  }

  const [row] = await db
    .select({
      dueToday: sql<number>`count(*) filter (where ${tasks.dueDate} = ${today})::int`,
      overdue: sql<number>`count(*) filter (where ${tasks.dueDate} < ${today})::int`,
      blocked: sql<number>`count(*) filter (where ${tasks.status} = 'blocked')::int`,
    })
    .from(tasks)
    .where(and(...baseConditions));

  return {
    dueToday: row?.dueToday ?? 0,
    overdue: row?.overdue ?? 0,
    blocked: row?.blocked ?? 0,
  };
}

// ─── Upcoming Milestones ──────────────────────────────────────────────────────

export async function getUpcomingMilestones(
  db: DbExecutor,
  organizationId: string,
  accessibleProjectIds: string[] | null,
  lookaheadDays: 7 | 14 = 14,
): Promise<UpcomingMilestone[]> {
  const today = new Date().toISOString().slice(0, 10);
  const horizon = new Date();
  horizon.setDate(horizon.getDate() + lookaheadDays);
  const horizonDate = horizon.toISOString().slice(0, 10);

  const conditions = [
    eq(projectMilestones.organizationId, organizationId),
    eq(projectMilestones.status, 'planned'),
    gte(projectMilestones.targetDate, today),
    lte(projectMilestones.targetDate, horizonDate),
  ];

  if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) return [];
    conditions.push(inArray(projectMilestones.projectId, accessibleProjectIds));
  }

  const rows = await db
    .select({
      id: projectMilestones.id,
      name: projectMilestones.name,
      projectId: projectMilestones.projectId,
      projectName: projects.name,
      dueDate: projectMilestones.targetDate,
    })
    .from(projectMilestones)
    .innerJoin(projects, eq(projects.id, projectMilestones.projectId))
    .where(and(...conditions))
    .orderBy(asc(projectMilestones.targetDate))
    .limit(20);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    projectId: r.projectId,
    projectName: r.projectName,
    dueDate: r.dueDate!,
  }));
}

// ─── Pending Approvals ────────────────────────────────────────────────────────

export async function getPendingApprovalCount(
  db: DbExecutor,
  organizationId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, organizationId),
        eq(approvalRequests.status, 'submitted'),
      ),
    );
  return row?.count ?? 0;
}

// ─── Stale Projects ───────────────────────────────────────────────────────────

export async function getStaleProjects(
  db: DbExecutor,
  organizationId: string,
  accessibleProjectIds: string[] | null,
  staleDays = 14,
): Promise<StaleProject[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  const cutoffIso = cutoff.toISOString();

  const conditions = [
    eq(projects.organizationId, organizationId),
    eq(projects.status, 'active'),
    isNull(projects.archivedAt),
  ];

  if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) return [];
    conditions.push(inArray(projects.id, accessibleProjectIds));
  }

  // Stale = no task_activity in last N days (use a subquery to check)
  const staleCondition = sql`NOT EXISTS (
    SELECT 1 FROM task_activity ta
    INNER JOIN tasks t ON t.id = ta.task_id
    WHERE t.project_id = ${projects.id}
      AND ta.created_at >= ${cutoffIso}::timestamptz
  )`;

  const rows = await db
    .select({
      id: projects.id,
      name: projects.name,
      status: projects.status,
      updatedAt: projects.updatedAt,
    })
    .from(projects)
    .where(and(...conditions, staleCondition))
    .orderBy(asc(projects.updatedAt))
    .limit(20);

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    status: r.status,
    lastActivityAt: r.updatedAt,
  }));
}

// ─── Team Workload Snapshot ───────────────────────────────────────────────────

export async function getTeamWorkloadSnapshot(
  db: DbExecutor,
  organizationId: string,
  accessibleWorkspaceIds: string[],
  topN = 5,
): Promise<WorkloadEntry[]> {
  if (accessibleWorkspaceIds.length === 0) return [];

  const activeStatuses = ['todo', 'in_progress', 'in_review', 'blocked'] as const;

  const rows = await db
    .select({
      employeeId: employees.id,
      employeeName: employees.name,
      openTaskCount: sql<number>`count(${taskAssignees.id})::int`,
    })
    .from(taskAssignees)
    .innerJoin(tasks, eq(tasks.id, taskAssignees.taskId))
    .innerJoin(employees, eq(employees.id, taskAssignees.employeeId))
    .where(
      and(
        eq(tasks.organizationId, organizationId),
        inArray(tasks.workspaceId, accessibleWorkspaceIds),
        inArray(tasks.status, activeStatuses),
        isNull(tasks.archivedAt),
      ),
    )
    .groupBy(employees.id, employees.name)
    .orderBy(desc(sql<number>`count(${taskAssignees.id})`))
    .limit(topN);

  return rows.map((r) => ({
    employeeId: r.employeeId,
    employeeName: r.employeeName,
    openTaskCount: r.openTaskCount,
  }));
}

// ─── Recent Activity ──────────────────────────────────────────────────────────

export async function getRecentTaskActivity(
  db: DbExecutor,
  organizationId: string,
  accessibleWorkspaceIds: string[],
  limit = 10,
): Promise<RecentActivityEvent[]> {
  if (accessibleWorkspaceIds.length === 0) return [];

  const rows = await db
    .select({
      id: taskActivity.id,
      taskId: taskActivity.taskId,
      taskTitle: tasks.title,
      eventType: taskActivity.eventType,
      occurredAt: taskActivity.createdAt,
      workspaceName: workspaces.name,
      projectName: projects.name,
    })
    .from(taskActivity)
    .innerJoin(tasks, eq(tasks.id, taskActivity.taskId))
    .innerJoin(workspaces, eq(workspaces.id, tasks.workspaceId))
    .leftJoin(projects, eq(projects.id, tasks.projectId))
    .where(
      and(
        eq(taskActivity.organizationId, organizationId),
        inArray(tasks.workspaceId, accessibleWorkspaceIds),
      ),
    )
    .orderBy(desc(taskActivity.createdAt))
    .limit(limit);

  return rows.map((r) => ({
    id: r.id,
    taskId: r.taskId,
    taskTitle: r.taskTitle,
    eventType: r.eventType,
    occurredAt: r.occurredAt,
    workspaceName: r.workspaceName ?? null,
    projectName: r.projectName ?? null,
  }));
}

// ─── Accessible workspace IDs ─────────────────────────────────────────────────

export async function getAccessibleWorkspaceIds(
  db: DbExecutor,
  organizationId: string,
  membershipId: string,
): Promise<string[]> {
  // Import dynamically to avoid circular deps at load time.
  // Returns all workspaces the user is a member of, or ALL workspaces if org-level access.
  const { workspaceMembers } = await import('@drizzle/schema');

  const rows = await db
    .select({ workspaceId: workspaceMembers.workspaceId })
    .from(workspaceMembers)
    .where(
      and(
        eq(workspaceMembers.organizationId, organizationId),
        eq(workspaceMembers.orgMemberId, membershipId),
      ),
    );

  return rows.map((r) => r.workspaceId);
}
