import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';

const resolveAccessibleProjectIds = vi.fn();
const getAccessibleWorkspaceIds = vi.fn();
const getActiveProjectStats = vi.fn();
const getAccessibleTaskCounts = vi.fn();
const getUpcomingMilestones = vi.fn();
const getPendingApprovalCount = vi.fn();
const getStaleProjects = vi.fn();
const getTeamWorkloadSnapshot = vi.fn();
const getRecentTaskActivity = vi.fn();

vi.mock('@/modules/projects/application/project-access', () => ({
  resolveAccessibleProjectIds: (...args: unknown[]) => resolveAccessibleProjectIds(...args),
}));

vi.mock('@/modules/operations/data/operations.repository', () => ({
  getAccessibleWorkspaceIds: (...args: unknown[]) => getAccessibleWorkspaceIds(...args),
  getActiveProjectStats: (...args: unknown[]) => getActiveProjectStats(...args),
  getAccessibleTaskCounts: (...args: unknown[]) => getAccessibleTaskCounts(...args),
  getUpcomingMilestones: (...args: unknown[]) => getUpcomingMilestones(...args),
  getPendingApprovalCount: (...args: unknown[]) => getPendingApprovalCount(...args),
  getStaleProjects: (...args: unknown[]) => getStaleProjects(...args),
  getTeamWorkloadSnapshot: (...args: unknown[]) => getTeamWorkloadSnapshot(...args),
  getRecentTaskActivity: (...args: unknown[]) => getRecentTaskActivity(...args),
}));

import { getOperationsDashboard } from '@/modules/operations/application/get-operations-dashboard';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'membership-1',
    organization: {
      id: 'org-1',
      name: 'Test',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    permissions: new Set(permissions),
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

describe('getOperationsDashboard (O05)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resolveAccessibleProjectIds.mockResolvedValue(['proj-1']);
    getAccessibleWorkspaceIds.mockResolvedValue(['ws-1']);
    getActiveProjectStats.mockResolvedValue({ activeCount: 2, byStage: [] });
    getAccessibleTaskCounts.mockResolvedValue({ dueToday: 1, overdue: 0, blocked: 0 });
    getUpcomingMilestones.mockResolvedValue([]);
    getPendingApprovalCount.mockResolvedValue(3);
    getStaleProjects.mockResolvedValue([]);
    getTeamWorkloadSnapshot.mockResolvedValue([]);
    getRecentTaskActivity.mockResolvedValue([]);
  });

  it('requires operations.read', async () => {
    await expect(getOperationsDashboard(contextWith([]))).rejects.toBeInstanceOf(AuthorizationError);
    expect(resolveAccessibleProjectIds).not.toHaveBeenCalled();
  });

  it('returns dashboard snapshot when permitted', async () => {
    const context = contextWith([PERMISSIONS.OPERATIONS_READ]);
    const result = await getOperationsDashboard(context);

    expect(result).toMatchObject({
      projects: { activeCount: 2, byStage: [] },
      taskCounts: { dueToday: 1, overdue: 0, blocked: 0 },
      pendingApprovalCount: 3,
      canViewFinancials: false,
      teamWorkload: null,
    });
    expect(getTeamWorkloadSnapshot).not.toHaveBeenCalled();
    expect(getActiveProjectStats).toHaveBeenCalledWith(
      context.db,
      'org-1',
      ['proj-1'],
    );
  });

  it('loads workload and financials flags when extra permissions granted', async () => {
    const context = contextWith([
      PERMISSIONS.OPERATIONS_READ,
      PERMISSIONS.WORKLOAD_READ,
      PERMISSIONS.PROJECT_FINANCIALS_READ,
    ]);

    const result = await getOperationsDashboard(context);

    expect(result.canViewFinancials).toBe(true);
    expect(result.teamWorkload).toEqual([]);
    expect(getTeamWorkloadSnapshot).toHaveBeenCalledWith(context.db, 'org-1', ['ws-1'], 5);
  });
});
