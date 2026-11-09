import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

vi.mock('@/modules/ap', () => ({ listApBillsForOrg: vi.fn() }));
vi.mock('@/modules/assets', () => ({ listMaintenanceScheduleForOrg: vi.fn() }));
vi.mock('@/modules/billing', () => ({ listBillingRecords: vi.fn() }));
vi.mock('@/modules/billing-plan', () => ({ listPlansWithRetentionHeld: vi.fn() }));
vi.mock('@/modules/closeout', () => ({ listCloseoutStatusesForProjects: vi.fn() }));
vi.mock('@/modules/compliance', () => ({ listComplianceArtifactsForOrg: vi.fn() }));
vi.mock('@/modules/forecast', () => ({ getOrganizationEarlyWarnings: vi.fn() }));
vi.mock('@/modules/ocr', () => ({ getOcrQueueSnapshot: vi.fn() }));
vi.mock('@/modules/projects', () => ({
  listProjectMilestones: vi.fn(),
  listProjectsForOrg: vi.fn(),
}));
vi.mock('@/modules/quotes', () => ({ listQuotesForOrg: vi.fn() }));
vi.mock('@/modules/tenancy', () => ({ getModuleVisibility: vi.fn() }));
vi.mock('@/modules/warranty', () => ({ listOrgWarrantyCoverages: vi.fn() }));
vi.mock('@/modules/workforce', () => ({ listTimesheetsForOrg: vi.fn() }));

const taskMocks = vi.hoisted(() => ({
  listBlockedUwmTasksForAutomation: vi.fn(),
  listTaskReminderDueUwmTasks: vi.fn(),
  listOverdueUwmTasks: vi.fn(),
}));

vi.mock('@/modules/tasks', () => ({
  listBlockedUwmTasksForAutomation: taskMocks.listBlockedUwmTasksForAutomation,
  listTaskReminderDueUwmTasks: taskMocks.listTaskReminderDueUwmTasks,
  listOverdueUwmTasks: taskMocks.listOverdueUwmTasks,
}));

import { collectPresetMatches } from '@/modules/automations/application/collect-matches';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';

function contextWithTasksRead(): OrgContext {
  return {
    organizationId: 'org-1',
    userId: 'user-1',
    membershipId: 'mem-1',
    locale: 'en',
    db: {} as OrgContext['db'],
    organization: { id: 'org-1', timezone: 'Asia/Jerusalem', name: 'Org' },
    permissions: new Set([PERMISSIONS.TASKS_READ]),
  } as unknown as OrgContext;
}

function contextWithoutTasksRead(): OrgContext {
  return {
    ...contextWithTasksRead(),
    permissions: new Set(),
  } as unknown as OrgContext;
}

describe('collectPresetMatches task scanners', () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it('task_blocked returns capped matches with TASKS_READ', async () => {
    taskMocks.listBlockedUwmTasksForAutomation.mockResolvedValue([
      {
        id: 't1',
        title: 'Blocked',
        projectId: 'p1',
        workspaceId: 'w1',
      },
    ]);

    const matches = await collectPresetMatches(contextWithTasksRead(), 'task_blocked');
    expect(matches).toHaveLength(1);
    expect(matches[0]).toMatchObject({
      entityType: 'task',
      entityId: 't1',
      taskId: 't1',
      href: '/tasks/t1',
    });
    expect(taskMocks.listBlockedUwmTasksForAutomation).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      20,
    );
  });

  it('task_blocked returns [] without TASKS_READ', async () => {
    const matches = await collectPresetMatches(contextWithoutTasksRead(), 'task_blocked');
    expect(matches).toEqual([]);
    expect(taskMocks.listBlockedUwmTasksForAutomation).not.toHaveBeenCalled();
  });

  it('task_reminder_due uses reminder scan list', async () => {
    taskMocks.listTaskReminderDueUwmTasks.mockResolvedValue([
      {
        id: 't2',
        title: 'Remind',
        projectId: null,
        workspaceId: 'w1',
      },
    ]);

    const matches = await collectPresetMatches(contextWithTasksRead(), 'task_reminder_due');
    expect(matches).toHaveLength(1);
    expect(matches[0]?.entityId).toBe('t2');
    expect(taskMocks.listTaskReminderDueUwmTasks).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      expect.any(Date),
      20,
    );
  });
});
