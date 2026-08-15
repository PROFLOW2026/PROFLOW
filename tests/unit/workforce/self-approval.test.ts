import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { ALL_PERMISSION_KEYS, type PermissionKey } from '@/shared/permissions/catalog';
import { roleTemplate } from '@/shared/permissions/role-templates';

vi.mock('@/modules/workforce/data/employees.repository', () => ({
  findEmployeeById: vi.fn(),
  findEmployeeByUserId: vi.fn(),
}));

vi.mock('@/modules/workforce/data/time-entries.repository', () => ({
  findTimeEntryById: vi.fn(),
  listTimeEntries: vi.fn(),
  listTimeEntriesByIds: vi.fn(),
}));

vi.mock('@/modules/workforce/data/timesheets.repository', () => ({
  findTimesheetById: vi.fn(),
  findTimesheetByIdForUpdate: vi.fn(),
  findTimesheetByEmployeePeriodForUpdate: vi.fn(),
  insertTimesheet: vi.fn(),
  listRecordedEntriesInPeriod: vi.fn(),
  listTimesheets: vi.fn(),
  attachEntriesToTimesheet: vi.fn(),
  updateEntriesApproval: vi.fn(),
  updateTimesheetLifecycle: vi.fn(),
}));

vi.mock('@/shared/db', () => ({
  withTransaction: vi.fn(async (_db: unknown, fn: (tx: unknown) => unknown) => fn({})),
}));

vi.mock('@/shared/audit', () => ({
  AUDIT_ACTIONS: { TIMESHEET_APPROVED: 'timesheet.approved', TIME_ENTRY_APPROVED: 'time_entry.approved' },
  recordAuditEvent: vi.fn(),
}));

vi.mock('@/modules/projects/application/project-access', () => ({
  isAccessibleProjectId: () => true,
  resolveAccessibleProjectIds: vi.fn(async () => null),
}));

vi.mock('@/modules/workforce/application/workforce-cost-authz', () => ({
  canReadWorkforceCost: () => false,
}));

import { findEmployeeByUserId } from '@/modules/workforce/data/employees.repository';
import { findTimeEntryById } from '@/modules/workforce/data/time-entries.repository';
import {
  findTimesheetByIdForUpdate,
  listRecordedEntriesInPeriod,
  updateEntriesApproval,
  updateTimesheetLifecycle,
} from '@/modules/workforce/data/timesheets.repository';
import { approveTimeEntry, approveTimesheet } from '@/modules/workforce/application/timesheets';
import { assertNotSelfTimeApproval } from '@/modules/workforce/application/time-scope';

const EMPLOYEE_ID = 'aaaaaaaa-1111-4111-8111-111111111111';
const TIMESHEET_ID = 'cccccccc-3333-4333-8333-333333333333';
const ENTRY_ID = 'dddddddd-4444-4444-8444-444444444444';

function contextWith(permissions: readonly PermissionKey[], userId: string): OrgContext {
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
    roleKeys: [],
    db: {} as OrgContext['db'],
    locale: 'he-IL',
  };
}

function linkedEmployee() {
  return {
    id: EMPLOYEE_ID,
    organizationId: 'org-1',
    name: 'Manager Person',
    status: 'active' as const,
    userId: 'user-manager',
    employeeNumber: null,
    jobTitle: null,
    email: null,
    phone: null,
    notes: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    updatedAt: new Date('2026-01-01T00:00:00.000Z'),
  };
}

describe('timesheet self-approval', () => {
  const manager = contextWith(roleTemplate('manager').permissions, 'user-manager');
  const owner = contextWith(ALL_PERMISSION_KEYS, 'user-owner');

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(findEmployeeByUserId).mockImplementation(async (_db, _org, userId) =>
      userId === 'user-manager' ? linkedEmployee() : null,
    );
  });

  it('blocks a linked manager from approving their own timesheet', async () => {
    await expect(assertNotSelfTimeApproval(manager, EMPLOYEE_ID)).rejects.toMatchObject({
      messageKey: 'workforce.errors.selfApprovalBlocked',
    });
    await expect(assertNotSelfTimeApproval(manager, EMPLOYEE_ID)).rejects.toBeInstanceOf(
      DomainRuleError,
    );
  });

  it('lets the owner (all permissions) approve their own timesheet', async () => {
    vi.mocked(findEmployeeByUserId).mockResolvedValue({
      ...linkedEmployee(),
      userId: 'user-owner',
    });
    await expect(assertNotSelfTimeApproval(owner, EMPLOYEE_ID)).resolves.toBeUndefined();
  });

  it('rejects approveTimesheet when the actor is the linked employee', async () => {
    vi.mocked(findTimesheetByIdForUpdate).mockResolvedValue({
      id: TIMESHEET_ID,
      organizationId: 'org-1',
      employeeId: EMPLOYEE_ID,
      status: 'submitted',
      archivedAt: null,
      periodStart: '2026-08-09',
      periodEnd: '2026-08-15',
    } as never);

    await expect(approveTimesheet(manager, { timesheetId: TIMESHEET_ID })).rejects.toMatchObject({
      messageKey: 'workforce.errors.selfApprovalBlocked',
    });
    expect(updateTimesheetLifecycle).not.toHaveBeenCalled();
  });

  it('rejects approveTimeEntry when the actor is the linked employee', async () => {
    vi.mocked(findTimeEntryById).mockResolvedValue({
      id: ENTRY_ID,
      organizationId: 'org-1',
      employeeId: EMPLOYEE_ID,
      status: 'recorded',
      approvalStatus: 'submitted',
      archivedAt: null,
    } as never);

    await expect(approveTimeEntry(manager, { timeEntryId: ENTRY_ID })).rejects.toMatchObject({
      messageKey: 'workforce.errors.selfApprovalBlocked',
    });
    expect(updateEntriesApproval).not.toHaveBeenCalled();
  });

  it('does not treat an unlinked manager as self-approval', async () => {
    vi.mocked(findEmployeeByUserId).mockResolvedValue(null);
    vi.mocked(findTimesheetByIdForUpdate).mockResolvedValue({
      id: TIMESHEET_ID,
      organizationId: 'org-1',
      employeeId: EMPLOYEE_ID,
      status: 'submitted',
      archivedAt: null,
      periodStart: '2026-08-09',
      periodEnd: '2026-08-15',
    } as never);
    vi.mocked(listRecordedEntriesInPeriod).mockResolvedValue([]);
    vi.mocked(updateEntriesApproval).mockResolvedValue([]);
    vi.mocked(updateTimesheetLifecycle).mockResolvedValue({
      id: TIMESHEET_ID,
      employeeId: EMPLOYEE_ID,
      status: 'approved',
    } as never);

    await expect(approveTimesheet(manager, { timesheetId: TIMESHEET_ID })).resolves.toMatchObject({
      timesheet: { status: 'approved' },
    });
  });
});
