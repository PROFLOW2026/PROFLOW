import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';

const rollupMock = vi.hoisted(() => vi.fn(async () => ({ rows: [] })));
const reconcileMock = vi.hoisted(() => vi.fn(async () => 0));
const actionableMock = vi.hoisted(() =>
  vi.fn(async () => ({ items: [{ itemKey: 'today' }], totalActive: 1, hiddenByState: 0 })),
);
const unreadMock = vi.hoisted(() => vi.fn(async () => 4));
const mergedInboxMock = vi.hoisted(() => vi.fn());

vi.mock('@/modules/financials/application/get-organization-project-rollup', () => ({
  getOrganizationProjectRollup: rollupMock,
}));

vi.mock('@/modules/workforce/application/labor-allocation-alerts', () => ({
  reconcileStaleLaborAllocations: reconcileMock,
  listUnattributedProjectLaborSources: vi.fn(async () => []),
}));

vi.mock('@/modules/command-center/application/get-actionable-inbox', () => ({
  getActionableInbox: actionableMock,
  getActionableInboxIfAllowed: vi.fn(),
}));

vi.mock('@/modules/notifications/application/actionable-inbox', () => ({
  listMergedNotificationInbox: mergedInboxMock,
}));

vi.mock('@/modules/notifications/data/notifications.repository', () => ({
  countUnreadForRecipient: unreadMock,
}));

vi.mock('@/shared/auth/session', () => ({
  withOrgContext: async (fn: (context: unknown) => Promise<unknown>) =>
    fn({
      userId: 'user-1',
      organizationId: 'org-1',
      permissions: new Set([PERMISSIONS.NOTIFICATIONS_READ]),
      db: {},
    }),
}));

vi.mock('@/modules/notifications/ui/notification-bell', () => ({
  NotificationBell: () => null,
}));

describe('command center collection cost', () => {
  it(
    'calls getOrganizationProjectRollup once and does not reconcile labor',
    async () => {
    rollupMock.mockClear();
    reconcileMock.mockClear();
    const { collectAllSources } = await import('@/modules/command-center/data/collect-sources');
    await collectAllSources({
      context: {
        permissions: new Set([
          PERMISSIONS.PROJECT_FINANCIALS_READ,
          PERMISSIONS.WORKFORCE_COST_READ,
        ]),
        organizationId: 'org-1',
        organization: { baseCurrency: 'ILS', timezone: 'Asia/Jerusalem' },
        db: {},
      },
      modules: {},
      today: '2026-09-25',
      copyScope: {},
    } as never);

    expect(rollupMock).toHaveBeenCalledTimes(1);
    expect(reconcileMock).not.toHaveBeenCalled();
  },
    20_000,
  );

  it('does not recompute a rollup that the collection already loaded', async () => {
    rollupMock.mockClear();
    const { getOrganizationEarlyWarnings } = await import(
      '@/modules/forecast/application/get-org-warnings'
    );
    const result = await getOrganizationEarlyWarnings(
      { permissions: new Set([PERMISSIONS.PROJECT_FINANCIALS_READ]) } as never,
      { rollup: { rows: [] } as never },
    );
    expect(result).toEqual([]);
    expect(rollupMock).not.toHaveBeenCalled();
  });

  it('keeps the full Today inbox on getActionableInbox', async () => {
    actionableMock.mockClear();
    const { getTodayInbox } = await import('@/modules/command-center/application/get-today-inbox');
    const inbox = await getTodayInbox({} as never);
    expect(actionableMock).toHaveBeenCalledTimes(1);
    expect(inbox.totalActive).toBe(1);
  });
});

describe('notification bell shell', () => {
  it('reads the stored unread count and does not collect the command center', async () => {
    const loaderSource = readFileSync(
      path.join(process.cwd(), 'src/modules/notifications/ui/notification-bell-loader.tsx'),
      'utf8',
    );
    expect(loaderSource).not.toMatch(/listMergedNotificationInbox|collectAllSources|getOrganizationProjectRollup/);
    expect(loaderSource).toContain('countUnreadForRecipient');

    const shellSource = readFileSync(
      path.join(process.cwd(), 'src/components/shell/app-shell.tsx'),
      'utf8',
    );
    expect(shellSource).not.toMatch(/collectAllSources|getOrganizationProjectRollup|listMergedNotificationInbox/);

    unreadMock.mockClear();
    mergedInboxMock.mockClear();
    const { NotificationBellLoader } = await import(
      '@/modules/notifications/ui/notification-bell-loader'
    );
    const element = await NotificationBellLoader();
    expect(unreadMock).toHaveBeenCalledTimes(1);
    expect(mergedInboxMock).not.toHaveBeenCalled();
    expect(element.props.initialInbox).toEqual({ items: [], unreadCount: 4 });
  });
});
