import 'server-only';
import { sql, type SQL } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AuthorizationError } from '@/shared/errors';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { getWorkspaceScope } from '@/modules/workspaces/domain/access';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

/** Per-employee workload summary. */
export interface WorkloadEmployeeRow {
  readonly employeeId: string;
  readonly name: string;
  readonly openTasks: number;
  readonly overdueTasks: number;
  readonly dueThisWeek: number;
  readonly projectCount: number;
  /**
   * Total estimated effort in minutes across open tasks.
   * Null when the column is not populated for any employee (column hidden).
   */
  readonly totalEstimatedMinutes: number | null;
}

/** Top overdue/due-soon tasks for a single employee (expanded row). */
export interface WorkloadTaskPreview {
  readonly taskId: string;
  readonly title: string;
  readonly status: string;
  readonly dueDate: string | null;
  readonly projectName: string | null;
  readonly projectId: string | null;
}

export interface TeamWorkloadResult {
  readonly rows: readonly WorkloadEmployeeRow[];
  /**
   * true when at least one employee has estimated_effort_minutes populated.
   * When false, the effort column should be hidden entirely — no fabricated %.
   */
  readonly showEstimatedEffort: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sqlRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  if (result && typeof result === 'object' && 'rows' in result) {
    return (result as { rows: T[] }).rows;
  }
  return [];
}

/** Task rows visible on Workload — workspace rules in SQL (no full workspace ID list). */
function workloadTaskVisibilitySql(context: OrgContext, workspaceScope: ReturnType<typeof getWorkspaceScope>): SQL {
  if (workspaceScope === 'full') return sql``;

  return sql`AND (
    EXISTS (
      SELECT 1 FROM workspaces w
      WHERE w.id = t.workspace_id
        AND w.organization_id = ${context.organizationId}
        AND w.is_archived = false
        AND (
          w.workspace_visibility = 'organization'
          OR EXISTS (
            SELECT 1 FROM workspace_members wm
            WHERE wm.workspace_id = w.id
              AND wm.org_member_id = ${context.membershipId}::uuid
              AND wm.organization_id = ${context.organizationId}
          )
        )
    )
  )`;
}

function workloadTaskProjectAccessSql(accessibleProjectIds: readonly string[] | null): SQL {
  if (accessibleProjectIds === null) return sql``;
  if (accessibleProjectIds.length === 0) {
    return sql`AND t.project_id IS NULL`;
  }
  return sql`AND (t.project_id IS NULL OR t.project_id = ANY(${accessibleProjectIds}::uuid[]))`;
}

function workloadAssignmentProjectAccessSql(accessibleProjectIds: readonly string[] | null): SQL {
  if (accessibleProjectIds === null) return sql``;
  if (accessibleProjectIds.length === 0) {
    return sql`AND false`;
  }
  return sql`AND epa.project_id = ANY(${accessibleProjectIds}::uuid[])`;
}

type WorkloadAccessScope = {
  readonly workspaceScope: ReturnType<typeof getWorkspaceScope>;
  readonly accessibleProjectIds: readonly string[] | null;
};

async function resolveWorkloadAccessScope(context: OrgContext): Promise<WorkloadAccessScope> {
  const workspaceScope = getWorkspaceScope(context);
  if (workspaceScope === 'none') {
    return { workspaceScope, accessibleProjectIds: [] };
  }
  const accessibleProjectIds = await resolveAccessibleProjectIds(context);
  return { workspaceScope, accessibleProjectIds };
}

// ---------------------------------------------------------------------------
// Main query
// ---------------------------------------------------------------------------

/**
 * Team workload aggregation — one row per active employee.
 *
 * Design rules:
 * - Only active employees in the organization.
 * - Task counts scoped to org tasks (via task_assignees.employee_id).
 * - Task / project assignment stats aggregated in separate CTEs (no assignee × EPA join blow-up).
 * - No fabricated utilization %. Show effort only when data exists.
 * - Permission: workload.read; tasks scoped like My Work (workspace + project access).
 */
export async function getTeamWorkload(
  context: OrgContext,
  scope?: WorkloadAccessScope,
): Promise<TeamWorkloadResult> {
  if (!hasPermission(context, PERMISSIONS.WORKLOAD_READ)) {
    throw new AuthorizationError('workload.read permission required');
  }

  const access = scope ?? (await resolveWorkloadAccessScope(context));
  if (access.workspaceScope === 'none') {
    return { rows: [], showEstimatedEffort: false };
  }

  const { workspaceScope, accessibleProjectIds } = access;
  const taskVisibility = workloadTaskVisibilitySql(context, workspaceScope);
  const taskProjectAccess = workloadTaskProjectAccessSql(accessibleProjectIds);
  const assignmentProjectAccess = workloadAssignmentProjectAccessSql(accessibleProjectIds);

  type WorkloadRow = {
    employee_id: string;
    name: string;
    open_tasks: string;
    overdue_tasks: string;
    due_this_week: string;
    project_count: string;
    total_estimated_minutes: string | null;
  };

  const rows = sqlRows<WorkloadRow>(
    await context.db.execute(sql`
      WITH task_stats AS (
        SELECT
          ta.employee_id,
          COUNT(ta.task_id) FILTER (
            WHERE t.status NOT IN ('done', 'cancelled')
              AND t.is_archived = false
          )::int AS open_tasks,
          COUNT(ta.task_id) FILTER (
            WHERE t.status NOT IN ('done', 'cancelled')
              AND t.due_date < CURRENT_DATE
              AND t.is_archived = false
          )::int AS overdue_tasks,
          COUNT(ta.task_id) FILTER (
            WHERE t.due_date >= CURRENT_DATE
              AND t.due_date <= CURRENT_DATE + INTERVAL '7 days'
              AND t.status NOT IN ('done', 'cancelled')
              AND t.is_archived = false
          )::int AS due_this_week,
          SUM(t.estimated_effort_minutes) FILTER (
            WHERE t.status NOT IN ('done', 'cancelled')
              AND t.is_archived = false
          ) AS total_estimated_minutes
        FROM task_assignees ta
        INNER JOIN tasks t ON t.id = ta.task_id
          AND t.organization_id = ${context.organizationId}
        WHERE 1 = 1
          ${taskVisibility}
          ${taskProjectAccess}
        GROUP BY ta.employee_id
      ),
      project_stats AS (
        SELECT
          epa.employee_id,
          COUNT(DISTINCT epa.project_id)::int AS project_count
        FROM employee_project_assignments epa
        WHERE epa.organization_id = ${context.organizationId}
          AND epa.status = 'active'
          ${assignmentProjectAccess}
        GROUP BY epa.employee_id
      )
      SELECT
        e.id AS employee_id,
        e.name,
        COALESCE(ts.open_tasks, 0)::int AS open_tasks,
        COALESCE(ts.overdue_tasks, 0)::int AS overdue_tasks,
        COALESCE(ts.due_this_week, 0)::int AS due_this_week,
        COALESCE(ps.project_count, 0)::int AS project_count,
        ts.total_estimated_minutes
      FROM employees e
      LEFT JOIN task_stats ts ON ts.employee_id = e.id
      LEFT JOIN project_stats ps ON ps.employee_id = e.id
      WHERE e.organization_id = ${context.organizationId}
        AND e.status = 'active'
      ORDER BY open_tasks DESC, e.name ASC
    `),
  );

  // Only show estimated effort column when at least one employee has data.
  const anyEffort = rows.some(
    (r) => r.total_estimated_minutes !== null && r.total_estimated_minutes !== '0',
  );

  const mapped: WorkloadEmployeeRow[] = rows.map((row) => ({
    employeeId: row.employee_id,
    name: row.name,
    openTasks: parseInt(row.open_tasks, 10) || 0,
    overdueTasks: parseInt(row.overdue_tasks, 10) || 0,
    dueThisWeek: parseInt(row.due_this_week, 10) || 0,
    projectCount: parseInt(row.project_count, 10) || 0,
    totalEstimatedMinutes: anyEffort
      ? row.total_estimated_minutes
        ? parseInt(row.total_estimated_minutes, 10)
        : 0
      : null,
  }));

  return { rows: mapped, showEstimatedEffort: anyEffort };
}

// ---------------------------------------------------------------------------
// Expanded row: top overdue/due-soon tasks for one employee
// ---------------------------------------------------------------------------

/**
 * Returns the top 5 overdue or due-soon tasks for a given employee.
 * Used in the expanded workload row.
 */
export async function getEmployeeTaskPreview(
  context: OrgContext,
  employeeId: string,
  scope?: WorkloadAccessScope,
): Promise<WorkloadTaskPreview[]> {
  if (!hasPermission(context, PERMISSIONS.WORKLOAD_READ)) {
    throw new AuthorizationError('workload.read permission required');
  }

  const access = scope ?? (await resolveWorkloadAccessScope(context));
  if (access.workspaceScope === 'none') return [];

  const { workspaceScope, accessibleProjectIds } = access;
  const taskVisibility = workloadTaskVisibilitySql(context, workspaceScope);
  const taskProjectAccess = workloadTaskProjectAccessSql(accessibleProjectIds);

  type PreviewRow = {
    task_id: string;
    title: string;
    status: string;
    due_date: string | null;
    project_name: string | null;
    project_id: string | null;
  };

  const rows = sqlRows<PreviewRow>(
    await context.db.execute(sql`
      SELECT
        t.id AS task_id,
        t.title,
        t.status,
        t.due_date,
        p.name AS project_name,
        t.project_id
      FROM tasks t
      JOIN task_assignees ta ON ta.task_id = t.id
        AND ta.employee_id = ${employeeId}::uuid
      LEFT JOIN projects p ON p.id = t.project_id
      WHERE t.organization_id = ${context.organizationId}
        AND t.status NOT IN ('done', 'cancelled')
        AND t.is_archived = false
        ${taskVisibility}
        ${taskProjectAccess}
      ORDER BY
        CASE WHEN t.due_date < CURRENT_DATE THEN 0 ELSE 1 END ASC,
        t.due_date ASC NULLS LAST,
        t.created_at ASC
      LIMIT 5
    `),
  );

  return rows.map((row) => ({
    taskId: row.task_id,
    title: row.title,
    status: row.status,
    dueDate: row.due_date,
    projectName: row.project_name,
    projectId: row.project_id,
  }));
}

/** Workload page: one access-scope resolution, then table + optional expand preview. */
export async function loadWorkloadPageData(
  context: OrgContext,
  expandEmployeeId: string | null,
): Promise<{ workload: TeamWorkloadResult; previewTasks: WorkloadTaskPreview[] }> {
  const access = await resolveWorkloadAccessScope(context);
  const workload = await getTeamWorkload(context, access);
  const previewTasks = expandEmployeeId
    ? await getEmployeeTaskPreview(context, expandEmployeeId, access)
    : [];
  return { workload, previewTasks };
}
