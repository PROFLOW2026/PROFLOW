import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { type PermissionKey } from '@/shared/permissions/catalog';
import { roleTemplate } from '@/shared/permissions/role-templates';

vi.mock('@/shared/db', () => ({
  withTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => unknown) => fn({})),
}));

vi.mock('@/shared/audit', () => ({
  AUDIT_ACTIONS: {
    PUNCH_LIST_ITEM_CREATED: 'punch_list_item.created',
    PUNCH_LIST_ITEM_UPDATED: 'punch_list_item.updated',
  },
  recordAuditEvent: vi.fn(),
}));

vi.mock('@/modules/tenancy', () => ({
  noteModuleUsage: vi.fn(),
}));

vi.mock('@/modules/notifications', () => ({
  emitNotification: vi.fn(),
}));

vi.mock('@/modules/projects', () => ({
  assertCanAccessProject: vi.fn(),
  isAccessibleProjectId: () => true,
  resolveAccessibleProjectIds: vi.fn(async () => null),
}));

vi.mock('@/modules/field-ops/application/assert-project-refs', () => ({
  assertProjectRefsInOrg: vi.fn(),
}));

vi.mock('@/modules/workforce/data/employees.repository', () => ({
  findEmployeeById: vi.fn(),
}));

vi.mock('@/modules/field-ops/data/field-ops.repository', () => ({
  findPunchListItemById: vi.fn(),
  findPunchListItemByIdForUpdate: vi.fn(),
  insertPunchListItem: vi.fn(),
  listActiveEmployeeNameOptions: vi.fn(),
  listPunchListItems: vi.fn(),
  updatePunchListItemById: vi.fn(),
}));

import { emitNotification } from '@/modules/notifications';
import { findEmployeeById } from '@/modules/workforce/data/employees.repository';
import {
  findPunchListItemByIdForUpdate,
  updatePunchListItemById,
} from '@/modules/field-ops/data/field-ops.repository';
import { updatePunchListItem } from '@/modules/field-ops/application/punch-list';

const PUNCH_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const PROJECT_ID = 'bbbbbbbb-2222-4222-8222-222222222222';
const ASSIGNEE_ID = 'cccccccc-3333-4333-8333-333333333333';
const ASSIGNEE_USER_ID = 'dddddddd-4444-4444-8444-444444444444';

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
    roleKeys: ['manager'],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function punchRow(assigneeEmployeeId: string | null = null) {
  return {
    id: PUNCH_ID,
    organizationId: 'org-1',
    projectId: PROJECT_ID,
    workPackageId: null,
    title: 'Fix leak',
    description: null,
    status: 'open' as const,
    priority: 'normal' as const,
    location: 'Room 2',
    dueDate: '2026-08-20',
    assigneeEmployeeId,
    closedAt: null,
    archivedAt: null,
    createdAt: new Date('2026-08-01T00:00:00.000Z'),
    updatedAt: new Date('2026-08-01T00:00:00.000Z'),
  };
}

describe('punch assignee update', () => {
  const manager = contextWith(roleTemplate('manager').permissions);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findPunchListItemByIdForUpdate).mockResolvedValue(punchRow(null));
    vi.mocked(findEmployeeById).mockResolvedValue({
      id: ASSIGNEE_ID,
      organizationId: 'org-1',
      name: 'Site tech',
      status: 'active',
      userId: ASSIGNEE_USER_ID,
      employeeNumber: null,
      jobTitle: null,
      email: null,
      phone: null,
      notes: null,
      standardHoursPerDay: null,
      archivedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    vi.mocked(updatePunchListItemById).mockResolvedValue(punchRow(ASSIGNEE_ID));
    vi.mocked(emitNotification).mockResolvedValue('notification-1');
  });

  it('persists assigneeEmployeeId and notifies the linked user', async () => {
    const updated = await updatePunchListItem(manager, {
      punchListItemId: PUNCH_ID,
      assigneeEmployeeId: ASSIGNEE_ID,
    });

    expect(updated.assigneeEmployeeId).toBe(ASSIGNEE_ID);
    expect(updatePunchListItemById).toHaveBeenCalledWith(
      expect.anything(),
      'org-1',
      PUNCH_ID,
      expect.objectContaining({ assigneeEmployeeId: ASSIGNEE_ID }),
      undefined,
    );
    expect(emitNotification).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        recipientUserId: ASSIGNEE_USER_ID,
        type: 'punch_assigned',
        entityType: 'punch_list_item',
        entityId: PUNCH_ID,
      }),
    );
  });

  it('does not re-notify when the assignee is unchanged', async () => {
    vi.mocked(findPunchListItemByIdForUpdate).mockResolvedValue(punchRow(ASSIGNEE_ID));
    vi.mocked(updatePunchListItemById).mockResolvedValue(punchRow(ASSIGNEE_ID));

    await updatePunchListItem(manager, {
      punchListItemId: PUNCH_ID,
      assigneeEmployeeId: ASSIGNEE_ID,
    });

    expect(emitNotification).not.toHaveBeenCalled();
  });

  it('can clear the assignee', async () => {
    vi.mocked(findPunchListItemByIdForUpdate).mockResolvedValue(punchRow(ASSIGNEE_ID));
    vi.mocked(updatePunchListItemById).mockResolvedValue(punchRow(null));

    const updated = await updatePunchListItem(manager, {
      punchListItemId: PUNCH_ID,
      assigneeEmployeeId: null,
    });

    expect(updated.assigneeEmployeeId).toBeNull();
    expect(emitNotification).not.toHaveBeenCalled();
  });
});
