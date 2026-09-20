import 'server-only';
import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { AuthorizationError } from '@/shared/errors';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import { formatProjectDisplayName } from '@/modules/projects/domain/display';
import {
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export type PortfolioHealthLevel = 'green' | 'amber' | 'red';

export function portfolioHealthLevel(score: number): PortfolioHealthLevel {
  if (score === 0) return 'green';
  if (score <= 3) return 'amber';
  return 'red';
}

/** A single project row in the portfolio table. */
export interface PortfolioProjectRow {
  readonly projectId: string;
  readonly name: string;
  readonly documentNumber: string | null;
  readonly displayName: string;
  readonly status: string;
  readonly workKind: string;
  readonly clientName: string | null;
  readonly currentStage: string | null;
  /** Tasks with project_id = this project only, excluding workspace-wide tasks. */
  readonly openTasks: number;
  readonly overdueTasks: number;
  readonly blockedTasks: number;
  /** health = overdueTasks × 2 + blockedTasks */
  readonly healthScore: number;
  readonly healthLevel: PortfolioHealthLevel;
  readonly nextMilestone: string | null;
  readonly lastActivityAt: Date | null;
}

export interface PortfolioResult {
  readonly rows: readonly PortfolioProjectRow[];
  readonly totalCount: number;
}

// ---------------------------------------------------------------------------
// Filter options
// ---------------------------------------------------------------------------

export interface PortfolioFilters {
  /** Filter by client ID. */
  readonly clientId?: string | null;
  /** Filter by stage definition ID. */
  readonly stageId?: string | null;
  /** Filter by work_kind: project | job | work_order. */
  readonly workKind?: string | null;
  /** Filter by project status: active | on_hold | completed. */
  readonly status?: string | null;
  /** When true, only projects with ≥1 overdue task. */
  readonly hasOverdue?: boolean;
  /** When true, only projects with no task_activity in the last 14 days. */
  readonly stale?: boolean;
  /** Filter by employee ID: only projects where employee has task_assignee rows. */
  readonly employeeId?: string | null;
  /** Filter by label ID: only projects that have at least one task with this label. */
  readonly labelId?: string | null;
  /** Pagination */
  readonly limit?: number | null;
  readonly offset?: number | null;
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

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

/**
 * Portfolio aggregation — one row per project, with task-count KPIs.
 *
 * CRITICAL ACCESS RULES enforced here:
 * 1. Only projects accessible to the caller (resolveAccessibleProjectIds).
 * 2. Task counts ONLY include tasks.project_id = p.id (never workspace-wide tasks).
 * 3. All filtering done in SQL — no fetch-all-then-filter.
 */
export async function getPortfolio(
  context: OrgContext,
  filters: PortfolioFilters = {},
): Promise<PortfolioResult> {
  if (!hasPermission(context, PERMISSIONS.PORTFOLIO_READ)) {
    throw new AuthorizationError('portfolio.read permission required');
  }

  // Resolve which project IDs this caller can see.
  // null = unrestricted (admin / access_all); string[] = explicit allowlist.
  const accessibleProjectIds = await resolveAccessibleProjectIds(context);

  const limit = resolveListLimit(filters.limit ?? undefined, {
    defaultLimit: 25,
    hardCap: ORG_LIST_HARD_CAP,
  });
  const offset = resolveListOffset(filters.offset ?? undefined);

  // Build the main query with all optional filters
  const rows = sqlRows<{
    project_id: string;
    name: string;
    document_number: string | null;
    status: string;
    work_kind: string;
    client_name: string | null;
    current_stage: string | null;
    open_tasks: string;
    overdue_tasks: string;
    blocked_tasks: string;
    health_score: string;
    next_milestone: string | null;
    last_activity_at: string | null;
    total_count: string;
  }>(
    await context.db.execute(sql`
      WITH project_task_counts AS (
        SELECT
          t.project_id,
          COUNT(t.id) FILTER (
            WHERE t.status NOT IN ('done', 'cancelled')
              AND t.is_archived = false
          )::int AS open_tasks,
          COUNT(t.id) FILTER (
            WHERE t.status NOT IN ('done', 'cancelled')
              AND t.due_date < CURRENT_DATE
              AND t.is_archived = false
          )::int AS overdue_tasks,
          COUNT(t.id) FILTER (
            WHERE t.status = 'blocked'
              AND t.is_archived = false
          )::int AS blocked_tasks
        FROM tasks t
        WHERE t.organization_id = ${context.organizationId}
          AND t.project_id IS NOT NULL
        GROUP BY t.project_id
      ),
      project_last_activity AS (
        SELECT
          t2.project_id,
          MAX(ta.created_at) AS last_activity_at
        FROM task_activity ta
        JOIN tasks t2 ON t2.id = ta.task_id
        WHERE t2.organization_id = ${context.organizationId}
          AND t2.project_id IS NOT NULL
        GROUP BY t2.project_id
      ),
      filtered_projects AS (
        SELECT
          p.id AS project_id,
          p.name,
          p.document_number,
          p.status,
          p.work_kind,
          c.name AS client_name,
          -- current stage: latest transition
          (
            SELECT psd.name
            FROM project_stage_transitions pst
            JOIN project_stage_definitions psd ON psd.id = pst.to_stage_id
            WHERE pst.project_id = p.id
            ORDER BY pst.transitioned_at DESC, pst.id DESC
            LIMIT 1
          ) AS current_stage,
          COALESCE(ptc.open_tasks, 0) AS open_tasks,
          COALESCE(ptc.overdue_tasks, 0) AS overdue_tasks,
          COALESCE(ptc.blocked_tasks, 0) AS blocked_tasks,
          -- health score: overdue * 2 + blocked
          (COALESCE(ptc.overdue_tasks, 0) * 2 + COALESCE(ptc.blocked_tasks, 0)) AS health_score,
          -- next upcoming milestone
          (
            SELECT pm.name || ' (' || pm.target_date::text || ')'
            FROM project_milestones pm
            WHERE pm.project_id = p.id
              AND pm.status = 'planned'
              AND pm.target_date >= CURRENT_DATE
            ORDER BY pm.target_date ASC
            LIMIT 1
          ) AS next_milestone,
          pla.last_activity_at
        FROM projects p
        LEFT JOIN clients c ON c.id = p.client_id
        LEFT JOIN project_task_counts ptc ON ptc.project_id = p.id
        LEFT JOIN project_last_activity pla ON pla.project_id = p.id
        WHERE p.organization_id = ${context.organizationId}
          AND p.archived_at IS NULL
          -- Caller access filter
          ${accessibleProjectIds === null
            ? sql``
            : accessibleProjectIds.length === 0
              ? sql`AND false`
              : sql`AND p.id = ANY(${accessibleProjectIds}::uuid[])`}
          -- Optional filters
          ${filters.clientId ? sql`AND p.client_id = ${filters.clientId}::uuid` : sql``}
          ${filters.stageId
            ? sql`AND EXISTS (
                SELECT 1 FROM project_stage_transitions pst2
                WHERE pst2.project_id = p.id
                  AND pst2.to_stage_id = ${filters.stageId}::uuid
                  AND pst2.id = (
                    SELECT id FROM project_stage_transitions
                    WHERE project_id = p.id
                    ORDER BY transitioned_at DESC, id DESC
                    LIMIT 1
                  )
              )`
            : sql``}
          ${filters.workKind ? sql`AND p.work_kind = ${filters.workKind}` : sql``}
          ${filters.status ? sql`AND p.status = ${filters.status}` : sql``}
          ${filters.hasOverdue
            ? sql`AND COALESCE(ptc.overdue_tasks, 0) > 0`
            : sql``}
          ${filters.stale
            ? sql`AND (pla.last_activity_at IS NULL OR pla.last_activity_at < NOW() - INTERVAL '14 days')`
            : sql``}
          ${filters.employeeId
            ? sql`AND EXISTS (
                SELECT 1
                FROM task_assignees ta2
                JOIN tasks t3 ON t3.id = ta2.task_id
                WHERE t3.project_id = p.id
                  AND ta2.employee_id = ${filters.employeeId}::uuid
              )`
            : sql``}
          ${filters.labelId
            ? sql`AND EXISTS (
                SELECT 1
                FROM task_label_assignments tla
                JOIN tasks t4 ON t4.id = tla.task_id
                WHERE t4.project_id = p.id
                  AND tla.label_id = ${filters.labelId}::uuid
              )`
            : sql``}
      )
      SELECT
        fp.*,
        COUNT(*) OVER()::text AS total_count
      FROM filtered_projects fp
      ORDER BY fp.name ASC
      LIMIT ${limit} OFFSET ${offset}
    `),
  );

  if (rows.length === 0) {
    return { rows: [], totalCount: 0 };
  }

  const totalCount = parseInt(rows[0]?.total_count ?? '0', 10);

  const mapped: PortfolioProjectRow[] = rows.map((row) => {
    const overdue = parseInt(row.overdue_tasks, 10);
    const blocked = parseInt(row.blocked_tasks, 10);
    const score = parseInt(row.health_score, 10);
    return {
      projectId: row.project_id,
      name: row.name,
      documentNumber: row.document_number,
      displayName: formatProjectDisplayName(row.name, row.document_number),
      status: row.status,
      workKind: row.work_kind,
      clientName: row.client_name,
      currentStage: row.current_stage,
      openTasks: parseInt(row.open_tasks, 10),
      overdueTasks: overdue,
      blockedTasks: blocked,
      healthScore: score,
      healthLevel: portfolioHealthLevel(score),
      nextMilestone: row.next_milestone,
      lastActivityAt: row.last_activity_at ? new Date(row.last_activity_at) : null,
    };
  });

  return { rows: mapped, totalCount };
}
