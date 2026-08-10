import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import { AuthorizationError } from '@/shared/errors';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { roleTemplate } from '@/shared/permissions/role-templates';
import {
  assertCanManageBillProjectAllocations,
  assertCanReadBillProjectAllocations,
} from '@/modules/ap/application/bill-project-allocations';
import {
  assertEmployeeMonthCostReadable,
  assertEmployeeMonthCostWritable,
  assertLaborAllocationReadable,
  assertLaborAllocationWritable,
} from '@/modules/workforce/application/employer-month-costs';
import { createRateVersion, listRateHistory } from '@/modules/workforce/application/rate-versions';
import {
  assertCanManageWorkforceCost,
  assertCanReadWorkforceCost,
  canManageWorkforceCost,
  canReadWorkforceCost,
} from '@/modules/workforce/application/workforce-cost-authz';

function contextWith(permissions: readonly PermissionKey[]): OrgContext {
  return {
    userId: 'user-worker',
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

describe('worker compensation / employer cost authorization', () => {
  const worker = contextWith(roleTemplate('worker').permissions);
  const workerPlusWorkforceRead = contextWith([
    ...roleTemplate('worker').permissions,
    PERMISSIONS.WORKFORCE_READ,
  ]);

  it('does not grant workforce cost keys on the worker role template', () => {
    const permissions = roleTemplate('worker').permissions;
    expect(permissions).not.toContain(PERMISSIONS.WORKFORCE_COST_READ);
    expect(permissions).not.toContain(PERMISSIONS.WORKFORCE_COST_MANAGE);
    expect(permissions).not.toContain(PERMISSIONS.WORKFORCE_READ);
    expect(permissions).not.toContain(PERMISSIONS.WORKFORCE_MANAGE);
    expect(permissions).not.toContain(PERMISSIONS.PROJECT_FINANCIALS_READ);
  });

  it('denies worker compensation / employer cost READ', async () => {
    expect(canReadWorkforceCost(worker)).toBe(false);
    expect(() => assertCanReadWorkforceCost(worker)).toThrow(AuthorizationError);
    expect(() => assertCanReadWorkforceCost(workerPlusWorkforceRead)).toThrow(AuthorizationError);

    await expect(listRateHistory(worker, 'employee-1')).rejects.toBeInstanceOf(AuthorizationError);
    await expect(listRateHistory(workerPlusWorkforceRead, 'employee-1')).rejects.toBeInstanceOf(
      AuthorizationError,
    );

    await expect(assertEmployeeMonthCostReadable(worker, 'employee-1')).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(assertLaborAllocationReadable(worker)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('denies worker compensation / employer cost WRITE (must be NO)', async () => {
    expect(canManageWorkforceCost(worker)).toBe(false);
    expect(() => assertCanManageWorkforceCost(worker)).toThrow(AuthorizationError);
    expect(() => assertCanManageWorkforceCost(workerPlusWorkforceRead)).toThrow(AuthorizationError);

    await expect(
      createRateVersion(worker, {
        employeeId: 'employee-1',
        validFrom: businessDate('2026-01-01'),
        baseRate: '100',
        rateUnit: 'hourly',
      }),
    ).rejects.toBeInstanceOf(AuthorizationError);

    await expect(assertEmployeeMonthCostWritable(worker, 'employee-1')).rejects.toBeInstanceOf(
      AuthorizationError,
    );
    await expect(assertLaborAllocationWritable(worker)).rejects.toBeInstanceOf(AuthorizationError);
  });

  it('keeps vendor bill project allocations on AP keys (worker has neither)', () => {
    expect(() => assertCanReadBillProjectAllocations(worker)).toThrow(AuthorizationError);
    expect(() => assertCanManageBillProjectAllocations(worker)).toThrow(AuthorizationError);
  });

  it('allows finance to read and manage employer cost by template', () => {
    const finance = contextWith(roleTemplate('finance').permissions);
    expect(canReadWorkforceCost(finance)).toBe(true);
    expect(canManageWorkforceCost(finance)).toBe(true);
    expect(() => assertCanReadWorkforceCost(finance)).not.toThrow();
    expect(() => assertCanManageWorkforceCost(finance)).not.toThrow();
  });

  it('allows manager to read employer cost but not manage by default', () => {
    const manager = contextWith(roleTemplate('manager').permissions);
    expect(canReadWorkforceCost(manager)).toBe(true);
    expect(canManageWorkforceCost(manager)).toBe(false);
    expect(() => assertCanManageWorkforceCost(manager)).toThrow(AuthorizationError);
  });
});
