import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveEmployeeAppEffectivePermissions } from '@/modules/employee-app/application/enrich-context';
import {
  employeePermissionScope,
  employeeHasPermission,
} from '@/modules/employee-app/application/load-employee-app-context';
import { grantsMapFromPreset } from '@/modules/employee-app/application/permission-editor';
import type { EmployeePresetKey } from '@/modules/employee-app/application/presets';

function employeeContextFromPreset(key: EmployeePresetKey): OrgContext {
  const grantStates = grantsMapFromPreset(key);
  const grants = new Map(
    [...grantStates.entries()].map(([permissionKey, state]) => [
      permissionKey,
      { permissionKey, scope: state.scope, granted: state.granted },
    ]),
  );
  const permissions = resolveEmployeeAppEffectivePermissions(grants);

  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'mem-1',
    locale: 'he-IL',
    db: {} as OrgContext['db'],
    organization: { id: 'org-1', name: 'Org', timezone: 'Asia/Jerusalem' } as OrgContext['organization'],
    permissions,
    roleKeys: ['employee'],
    employeeApp: {
      employeeId: 'emp-1',
      grants,
      allowedDocumentCategories: null,
      account: {
        id: 'acc-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
        userId: 'user-1',
        username: 'worker',
        usernameNormalized: 'worker',
        authEmail: 'worker@employee.local',
        status: 'active',
        pinMustChange: false,
        temporaryPinExpiresAt: null,
        accessStartsAt: null,
        accessEndsAt: null,
        disabledAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
        firstLoginAt: null,
        lastLoginAt: null,
      },
    },
  };
}

describe('employee expense permission scope', () => {
  it('includes expenses.read from office_admin preset via enrich permissions', () => {
    const officeAdmin = employeeContextFromPreset('office_admin');
    expect(employeeHasPermission(officeAdmin, PERMISSIONS.EXPENSES_READ)).toBe(true);
    expect(employeePermissionScope(officeAdmin, PERMISSIONS.EXPENSES_READ)).toBe('all_organization');
  });

  it('does not treat expenses.read as self_only when grant row exists', () => {
    const officeAdmin = employeeContextFromPreset('office_admin');
    expect(employeePermissionScope(officeAdmin, PERMISSIONS.EXPENSES_READ)).not.toBe('self_only');
  });

  it('returns null scope for attendance baseline without explicit grant row', () => {
    const worker = employeeContextFromPreset('field_worker');
    expect(employeeHasPermission(worker, PERMISSIONS.ATTENDANCE_SELF)).toBe(true);
    expect(employeePermissionScope(worker, PERMISSIONS.ATTENDANCE_SELF)).toBe('self_only');
    expect(employeeHasPermission(worker, PERMISSIONS.EXPENSES_READ)).toBe(false);
  });
});
