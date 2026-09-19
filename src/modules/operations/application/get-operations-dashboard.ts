/**
 * Operations Dashboard application logic.
 *
 * Separate from the financial Owner Dashboard (/). Permission: operations.read.
 * All counts are SQL-scoped to caller-accessible data.
 */
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveAccessibleProjectIds } from '@/modules/projects/application/project-access';
import {
  getAccessibleTaskCounts,
  getAccessibleWorkspaceIds,
  getActiveProjectStats,
  getPendingApprovalCount,
  getRecentTaskActivity,
  getStaleProjects,
  getTeamWorkloadSnapshot,
  getUpcomingMilestones,
  type ActiveProjectStats,
  type RecentActivityEvent,
  type StaleProject,
  type TaskCountStats,
  type UpcomingMilestone,
  type WorkloadEntry,
} from '../data/operations.repository';

export interface OperationsDashboardData {
  /** Accessible active project count + breakdown by stage */
  readonly projects: ActiveProjectStats;
  /** Caller-accessible task counts: dueToday, overdue, blocked */
  readonly taskCounts: TaskCountStats;
  /** Upcoming milestones within 14 days */
  readonly upcomingMilestones: readonly UpcomingMilestone[];
  /** Pending approval requests count */
  readonly pendingApprovalCount: number;
  /** Projects with no task activity in 14 days */
  readonly staleProjects: readonly StaleProject[];
  /** Top 5 employees by open task count (requires workload.read) */
  readonly teamWorkload: readonly WorkloadEntry[] | null;
  /** Last 10 task/stage events across accessible workspaces */
  readonly recentActivity: readonly RecentActivityEvent[];
  /** Whether the caller has financials access (caller decides to load financial card) */
  readonly canViewFinancials: boolean;
}

export async function getOperationsDashboard(
  context: OrgContext,
): Promise<OperationsDashboardData> {
  assertPermission(context, PERMISSIONS.OPERATIONS_READ);

  const canWorkload = hasPermission(context, PERMISSIONS.WORKLOAD_READ);
  const canFinancials = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  // Resolve caller-scoped access
  const [accessibleProjectIds, accessibleWorkspaceIds] = await Promise.all([
    resolveAccessibleProjectIds(context),
    getAccessibleWorkspaceIds(context.db, context.organizationId, context.membershipId),
  ]);

  // Run all data fetches in parallel
  const [
    activeProjectStats,
    taskCounts,
    upcomingMilestones,
    pendingApprovalCount,
    staleProjects,
    teamWorkload,
    recentActivity,
  ] = await Promise.all([
    getActiveProjectStats(context.db, context.organizationId, accessibleProjectIds),
    getAccessibleTaskCounts(
      context.db,
      context.organizationId,
      accessibleWorkspaceIds,
      accessibleProjectIds,
    ),
    getUpcomingMilestones(context.db, context.organizationId, accessibleProjectIds, 14),
    getPendingApprovalCount(context.db, context.organizationId),
    getStaleProjects(context.db, context.organizationId, accessibleProjectIds, 14),
    canWorkload
      ? getTeamWorkloadSnapshot(context.db, context.organizationId, accessibleWorkspaceIds, 5)
      : Promise.resolve(null),
    getRecentTaskActivity(context.db, context.organizationId, accessibleWorkspaceIds, 10),
  ]);

  return {
    projects: activeProjectStats,
    taskCounts,
    upcomingMilestones,
    pendingApprovalCount,
    staleProjects,
    teamWorkload,
    recentActivity,
    canViewFinancials: canFinancials,
  };
}
