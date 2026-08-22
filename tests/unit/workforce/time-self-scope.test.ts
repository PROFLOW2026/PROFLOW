import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { AuthorizationError, DomainRuleError } from '@/shared/errors';
import { ALL_PERMISSION_KEYS, PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { roleTemplate } from '@/shared/permissions/role-templates';

vi.mock('@/modules/workforce/data/time-entries.repository', () => ({
  listTimeEntries: vi.fn(),
  listNonProjectTimeCodes: vi.fn(),
  countNonProjectTimeCodes: vi.fn(),
  findNonProjectTimeCodeById: vi.fn(),
  findTimeEntryById: vi.fn(),
  insertNonProjectTimeCode: vi.fn(),
  insertTimeEntry: vi.fn(),
  sumProjectLaborCost: vi.fn(),
  voidTimeEntryRow: vi.fn(),
}));

vi.mock('@/modules/workforce/data/employees.repository', () => ({
  findEmployeeById: vi.fn(),
  findEmployeeByUserId: vi.fn(),
}));

vi.mock('@/modules/projects/application/project-access', () => ({
  assertCanAccessProject: vi.fn(),
  isAccessibleProjectId: () => true,
  resolveAccessibleProjectIds: vi.fn(async () => null),
}));

vi.mock('@/modules/workforce/application/workforce-cost-authz', () => ({
  canReadWorkforceCost: () => false,
}));

import { listTimeEntries, listNonProjectTimeCodes, countNonProjectTimeCodes } from '@/modules/workforce/data/time-entries.repository';
import { findEmployeeByUserId } from '@/modules/workforce/data/employees.repository';
import { listEmployeesForOrg } from '@/modules/workforce/application/employees';
import { listNonProjectCodes, listTimeEntriesForOrg } from '@/modules/workforce/application/time-entries';
import { assertCanActOnEmployeeTime } from '@/modules/workforce/application/time-scope';

const LINKED_EMPLOYEE_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const OTHER_EMPLOYEE_ID = 'bbbbbbbb-2222-4222-8222-222222222222';

function contextWith(permissions: readonly PermissionKey[], userId = 'user-worker'): OrgContext {
  return {
    userId,
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
    roleKeys: ['worker'],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function linkedEmployee(id = LINKED_EMPLOYEE_ID) {
  return {
    id,
    organizationId: 'org-1',
    name: 'Linked',
    status: 'active' as const,
    userId: 'user-worker',
    employeeNumber: 'E-1',
    jobTitle: null,
    email: null,
    phone: null,
    notes: null,
    standardHoursPerDay: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('worker self-scoped time', () => {
  const worker = contextWith(roleTemplate('worker').permissions);

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findEmployeeByUserId).mockResolvedValue(linkedEmployee());
    vi.mocked(countNonProjectTimeCodes).mockResolvedValue(1);
    vi.mocked(listTimeEntries).mockResolvedValue([
      {
        id: 'entry-self',
        employeeId: LINKED_EMPLOYEE_ID,
        employeeName: 'Linked',
        projectId: null,
      } as never,
    ]);
    vi.mocked(listNonProjectTimeCodes).mockResolvedValue([]);
  });

  it('lists only the linked employee time rows without workforce.read', async () => {
    expect(worker.permissions.has(PERMISSIONS.WORKFORCE_READ)).toBe(false);
    expect(worker.permissions.has(PERMISSIONS.TIME_MANAGE)).toBe(true);

    const rows = await listTimeEntriesForOrg(worker);
    expect(listTimeEntries).toHaveBeenCalledWith(
      worker.db,
      worker.organizationId,
      expect.objectContaining({ employeeId: LINKED_EMPLOYEE_ID }),
    );
    expect(rows).toHaveLength(1);
  });

  it('rejects a filter for another employee', async () => {
    await expect(listTimeEntriesForOrg(worker, { employeeId: OTHER_EMPLOYEE_ID })).rejects.toMatchObject(
      { messageKey: 'workforce.errors.timeSelfScope' },
    );
    expect(listTimeEntries).not.toHaveBeenCalled();
  });

  it('returns an empty list when the worker has no linked employee', async () => {
    vi.mocked(findEmployeeByUserId).mockResolvedValue(null);
    await expect(listTimeEntriesForOrg(worker)).resolves.toEqual([]);
    expect(listTimeEntries).not.toHaveBeenCalled();
  });

  it('allows time.manage to list non-project codes', async () => {
    await expect(listNonProjectCodes(worker)).resolves.toEqual([]);
  });

  it('does not let a worker list other employees', async () => {
    await expect(listEmployeesForOrg(worker)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('blocks acting on another employee without workforce.read', async () => {
    await expect(assertCanActOnEmployeeTime(worker, OTHER_EMPLOYEE_ID)).rejects.toBeInstanceOf(
      DomainRuleError,
    );
  });

  it('lets org-wide workforce.read list without forcing the linked employee', async () => {
    const manager = contextWith([PERMISSIONS.WORKFORCE_READ, PERMISSIONS.TIME_MANAGE], 'user-manager');
    vi.mocked(listTimeEntries).mockResolvedValue([]);
    await listTimeEntriesForOrg(manager, { employeeId: OTHER_EMPLOYEE_ID });
    expect(listTimeEntries).toHaveBeenCalledWith(
      manager.db,
      manager.organizationId,
      expect.objectContaining({ employeeId: OTHER_EMPLOYEE_ID }),
    );
  });

  it('owner catalog still includes workforce.read unlike worker', () => {
    expect(ALL_PERMISSION_KEYS).toContain(PERMISSIONS.WORKFORCE_READ);
    expect(roleTemplate('worker').permissions).not.toContain(PERMISSIONS.WORKFORCE_READ);
  });
});
