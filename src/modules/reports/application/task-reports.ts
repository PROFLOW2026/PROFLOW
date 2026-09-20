/**
 * Operational report data functions — task and project health reports.
 *
 * These produce ReportPayload-compatible data for the report previewer.
 * All queries are permission-gated and access-scoped.
 */

import { and, asc, desc, eq, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { projects, tasks, projectMilestones, approvalRequests, employees, taskAssignees } from '@drizzle/schema';
import { getAccessibleWorkspaceIds } from '@/modules/operations';

// ─── Task status per project ──────────────────────────────────────────────────

export interface TaskStatusByProject {
  readonly projectId: string | null;
  readonly projectName: string;
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly total: number;
}

/**
 * Task breakdown by status per project (or for a single project when projectId provided).
 * Scoped to caller-accessible workspaces and projects.
 */
export async function getProjectTaskStatusReport(
  context: OrgContext,
  projectId?: string,
): Promise<TaskStatusByProject[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const [accessibleProjectIds, accessibleWorkspaceIds] = await Promise.all([
    resolveAccessibleProjectIds(context),
    getAccessibleWorkspaceIds(context.db, context.organizationId, context.membershipId),
  ]);

  if (accessibleWorkspaceIds.length === 0) return [];

  const conditions = [
    eq(tasks.organizationId, context.organizationId),
    inArray(tasks.workspaceId, accessibleWorkspaceIds),
    isNull(tasks.archivedAt),
  ];

  if (projectId) {
    conditions.push(eq(tasks.projectId, projectId));
  } else if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) {
      conditions.push(isNull(tasks.projectId));
    } else {
      conditions.push(
        sql`(${tasks.projectId} IS NULL OR ${tasks.projectId} = ANY(${accessibleProjectIds}))`,
      );
    }
  }

  const rows = await context.db
    .select({
      projectId: tasks.projectId,
      projectName: sql<string>`coalesce((select p.name from projects p where p.id = ${tasks.projectId}), 'No Project')`,
      status: tasks.status,
      count: sql<number>`count(*)::int`,
    })
    .from(tasks)
    .where(and(...conditions))
    .groupBy(tasks.projectId, tasks.status)
    .orderBy(tasks.projectId, tasks.status);

  // Group by project
  const byProject = new Map<string, TaskStatusByProject>();
  for (const row of rows) {
    const key = row.projectId ?? '__none__';
    const existing = byProject.get(key);
    if (existing) {
      const statusCounts = { ...existing.statusCounts, [row.status]: row.count };
      byProject.set(key, {
        ...existing,
        statusCounts,
        total: existing.total + row.count,
      });
    } else {
      byProject.set(key, {
        projectId: row.projectId,
        projectName: row.projectName,
        statusCounts: { [row.status]: row.count },
        total: row.count,
      });
    }
  }

  return Array.from(byProject.values());
}

// ─── Overdue tasks ────────────────────────────────────────────────────────────

export interface OverdueTaskRow {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly priority: string;
  readonly dueDate: string;
  readonly projectName: string | null;
  readonly workspaceName: string;
  readonly daysOverdue: number;
}

export interface OverdueTasksFilters {
  readonly projectId?: string;
  readonly workspaceId?: string;
  readonly limit?: number;
}

/**
 * Org-wide overdue tasks by project + assignee.
 * Access-scoped to caller.
 */
export async function getOverdueTasksReport(
  context: OrgContext,
  filters: OverdueTasksFilters = {},
): Promise<OverdueTaskRow[]> {
  assertPermission(context, PERMISSIONS.TASKS_READ);

  const [accessibleProjectIds, accessibleWorkspaceIds] = await Promise.all([
    resolveAccessibleProjectIds(context),
    getAccessibleWorkspaceIds(context.db, context.organizationId, context.membershipId),
  ]);

  if (accessibleWorkspaceIds.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);

  const conditions = [
    eq(tasks.organizationId, context.organizationId),
    inArray(tasks.workspaceId, accessibleWorkspaceIds),
    isNull(tasks.archivedAt),
    lt(tasks.dueDate, today),
    inArray(tasks.status, ['todo', 'in_progress', 'in_review', 'blocked']),
  ];

  if (filters.projectId) {
    conditions.push(eq(tasks.projectId, filters.projectId));
  } else if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) {
      conditions.push(isNull(tasks.projectId));
    } else {
      conditions.push(
        sql`(${tasks.projectId} IS NULL OR ${tasks.projectId} = ANY(${accessibleProjectIds}))`,
      );
    }
  }

  if (filters.workspaceId) {
    conditions.push(eq(tasks.workspaceId, filters.workspaceId));
  }

  const limit = Math.min(filters.limit ?? 100, 500);

  const rows = await context.db
    .select({
      taskId: tasks.id,
      title: tasks.title,
      status: tasks.status,
      priority: tasks.priority,
      dueDate: tasks.dueDate,
      projectName: sql<string | null>`(select p.name from projects p where p.id = ${tasks.projectId} limit 1)`,
      workspaceName: sql<string>`(select w.name from workspaces w where w.id = ${tasks.workspaceId} limit 1)`,
      daysOverdue: sql<number>`(current_date - ${tasks.dueDate}::date)::int`,
    })
    .from(tasks)
    .where(and(...conditions))
    .orderBy(desc(sql`(current_date - ${tasks.dueDate}::date)`))
    .limit(limit);

  return rows.map((r) => ({
    taskId: r.taskId,
    title: r.title,
    status: r.status,
    priority: r.priority,
    dueDate: r.dueDate!,
    projectName: r.projectName,
    workspaceName: r.workspaceName,
    daysOverdue: r.daysOverdue,
  }));
}

// ─── Milestone status ─────────────────────────────────────────────────────────

export interface MilestoneStatusRow {
  readonly milestoneId: string;
  readonly name: string;
  readonly projectId: string;
  readonly projectName: string;
  readonly status: string;
  readonly dueDate: string | null;
  readonly daysRemaining: number | null;
}

/**
 * Milestone health across portfolio.
 * Scoped to caller-accessible projects.
 */
export async function getMilestoneStatusReport(
  context: OrgContext,
): Promise<MilestoneStatusRow[]> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);

  const accessibleProjectIds = await resolveAccessibleProjectIds(context);

  const conditions = [
    eq(projectMilestones.organizationId, context.organizationId),
    inArray(projectMilestones.status, ['planned', 'achieved', 'missed']),
  ];

  if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) return [];
    conditions.push(inArray(projectMilestones.projectId, accessibleProjectIds));
  }

  const rows = await context.db
    .select({
      milestoneId: projectMilestones.id,
      name: projectMilestones.name,
      projectId: projectMilestones.projectId,
      projectName: projects.name,
      status: projectMilestones.status,
      dueDate: projectMilestones.targetDate,
      daysRemaining: sql<number | null>`
        case when ${projectMilestones.targetDate} is not null
        then (${projectMilestones.targetDate}::date - current_date)::int
        else null end
      `,
    })
    .from(projectMilestones)
    .innerJoin(projects, eq(projects.id, projectMilestones.projectId))
    .where(and(...conditions))
    .orderBy(asc(projectMilestones.targetDate));

  return rows.map((r) => ({
    milestoneId: r.milestoneId,
    name: r.name,
    projectId: r.projectId,
    projectName: r.projectName,
    status: r.status,
    dueDate: r.dueDate,
    daysRemaining: r.daysRemaining,
  }));
}

// ─── Team workload ────────────────────────────────────────────────────────────

export interface TeamWorkloadRow {
  readonly employeeId: string;
  readonly employeeName: string;
  readonly openCount: number;
  readonly overdueCount: number;
  readonly doneCount: number;
}

/**
 * Tasks per employee — same data as Workload view.
 * Requires workload.read.
 */
export async function getTeamWorkloadReport(
  context: OrgContext,
): Promise<TeamWorkloadRow[]> {
  assertPermission(context, PERMISSIONS.WORKLOAD_READ);

  const accessibleWorkspaceIds = await getAccessibleWorkspaceIds(
    context.db,
    context.organizationId,
    context.membershipId,
  );
  if (accessibleWorkspaceIds.length === 0) return [];

  const today = new Date().toISOString().slice(0, 10);

  const rows = await context.db
    .select({
      employeeId: employees.id,
      employeeName: employees.name,
      openCount: sql<number>`count(*) filter (where ${tasks.status} in ('todo','in_progress','in_review','blocked'))::int`,
      overdueCount: sql<number>`count(*) filter (where ${tasks.dueDate} < ${today} and ${tasks.status} in ('todo','in_progress','in_review','blocked'))::int`,
      doneCount: sql<number>`count(*) filter (where ${tasks.status} = 'done')::int`,
    })
    .from(taskAssignees)
    .innerJoin(tasks, and(eq(tasks.id, taskAssignees.taskId), isNull(tasks.archivedAt)))
    .innerJoin(employees, eq(employees.id, taskAssignees.employeeId))
    .where(
      and(
        eq(tasks.organizationId, context.organizationId),
        inArray(tasks.workspaceId, accessibleWorkspaceIds),
      ),
    )
    .groupBy(employees.id, employees.name)
    .orderBy(desc(sql`count(*) filter (where ${tasks.status} in ('todo','in_progress','in_review','blocked'))`));

  return rows;
}

// ─── Stale projects report ────────────────────────────────────────────────────

export interface StaleProjectReportRow {
  readonly projectId: string;
  readonly name: string;
  readonly status: string;
  readonly daysSinceActivity: number | null;
}

/**
 * Projects with no task_activity in N days.
 */
export async function getStaleProjectsReport(
  context: OrgContext,
  staleDays = 14,
): Promise<StaleProjectReportRow[]> {
  assertPermission(context, PERMISSIONS.OPERATIONS_READ);

  const accessibleProjectIds = await resolveAccessibleProjectIds(context);

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - staleDays);
  const cutoffIso = cutoff.toISOString();

  const conditions = [
    eq(projects.organizationId, context.organizationId),
    eq(projects.status, 'active'),
    isNull(projects.archivedAt),
    sql`NOT EXISTS (
      SELECT 1 FROM task_activity ta
      INNER JOIN tasks t ON t.id = ta.task_id
      WHERE t.project_id = ${projects.id}
        AND ta.created_at >= ${cutoffIso}::timestamptz
    )`,
  ];

  if (accessibleProjectIds !== null) {
    if (accessibleProjectIds.length === 0) return [];
    conditions.push(inArray(projects.id, accessibleProjectIds));
  }

  const rows = await context.db
    .select({
      projectId: projects.id,
      name: projects.name,
      status: projects.status,
      daysSinceActivity: sql<number | null>`
        (select (extract(epoch from now() - max(ta.created_at))/86400)::int
         from task_activity ta
         inner join tasks t on t.id = ta.task_id
         where t.project_id = ${projects.id})
      `,
    })
    .from(projects)
    .where(and(...conditions))
    .orderBy(asc(projects.updatedAt))
    .limit(100);

  return rows;
}

// ─── Approval queue status ────────────────────────────────────────────────────

export interface ApprovalQueueRow {
  readonly entityType: string;
  readonly pendingCount: number;
}

/**
 * Pending approvals by entity type.
 */
export async function getApprovalQueueStatusReport(
  context: OrgContext,
): Promise<ApprovalQueueRow[]> {
  assertPermission(context, PERMISSIONS.APPROVALS_READ);

  const rows = await context.db
    .select({
      entityType: approvalRequests.entityType,
      pendingCount: sql<number>`count(*)::int`,
    })
    .from(approvalRequests)
    .where(
      and(
        eq(approvalRequests.organizationId, context.organizationId),
        eq(approvalRequests.status, 'submitted'),
      ),
    )
    .groupBy(approvalRequests.entityType)
    .orderBy(desc(sql<number>`count(*)`));

  return rows.map((r) => ({
    entityType: r.entityType,
    pendingCount: r.pendingCount,
  }));
}
