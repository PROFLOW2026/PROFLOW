import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveEmployeeAppEffectivePermissions } from '@/modules/employee-app/application/enrich-context';
import {
  buildEmployeeNavItems,
  EMPLOYEE_MANAGEMENT_NAV_HREFS,
  hasEmployeeManagementNav,
  type EmployeeNavItem,
} from '@/modules/employee-app/application/get-employee-shell';
import {
  employeeMobileNavLabelKey,
  partitionEmployeeNavItems,
  selectEmployeeMobileOverflowItems,
  selectEmployeeMobilePrimaryItems,
} from '@/modules/employee-app/application/employee-navigation';
import {
  grantsMapFromPreset,
  categoriesSetFromPreset,
} from '@/modules/employee-app/application/permission-editor';
import type { EmployeePresetKey } from '@/modules/employee-app/application/presets';

function employeeContextFromPreset(key: EmployeePresetKey): OrgContext {
  const grantStates = grantsMapFromPreset(key);
  const grants = new Map(
    [...grantStates.entries()].map(([permissionKey, state]) => [
      permissionKey,
      {
        permissionKey,
        scope: state.scope,
        granted: state.granted,
      },
    ]),
  );
  const categories = categoriesSetFromPreset(key);
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
      allowedDocumentCategories: categories.size > 0 ? categories : null,
      account: {
        id: 'acc-1',
        organizationId: 'org-1',
        employeeId: 'emp-1',
        userId: 'user-1',
        status: 'active',
        username: '2485',
        usernameNormalized: '2485',
        authEmail: '2485@employee.local',
        pinMustChange: false,
        temporaryPinExpiresAt: null,
        firstLoginAt: null,
        lastLoginAt: null,
        accessStartsAt: null,
        accessEndsAt: null,
        disabledAt: null,
        failedLoginCount: 0,
        lockedUntil: null,
      },
    },
  };
}

function hrefs(items: readonly EmployeeNavItem[]): string[] {
  return items.map((item) => item.href);
}

function visibleManagementHrefs(items: readonly EmployeeNavItem[]): string[] {
  return items.filter((item) => item.visible && item.group === 'management').map((item) => item.href);
}

describe('employee mobile navigation', () => {
  it('foreman gets four primaries and More for secondary modules', () => {
    const nav = buildEmployeeNavItems(employeeContextFromPreset('foreman'));
    const primary = selectEmployeeMobilePrimaryItems(nav);
    const overflow = selectEmployeeMobileOverflowItems(nav);

    expect(hrefs(primary)).toEqual([
      '/employee',
      '/employee/time',
      '/employee/projects',
      '/employee/tasks',
    ]);
    expect(hrefs(overflow).sort()).toEqual(['/employee/documents', '/employee/team'].sort());
  });

  it('field_worker_time gets home and time only — no back-fill from secondary', () => {
    const context = employeeContextFromPreset('field_worker_time');
    const withTime = {
      ...context,
      permissions: new Set([...context.permissions, PERMISSIONS.ATTENDANCE_SELF]),
    };
    const nav = buildEmployeeNavItems(withTime);
    const primary = selectEmployeeMobilePrimaryItems(nav);
    const overflow = selectEmployeeMobileOverflowItems(nav);

    expect(hrefs(primary)).toEqual(['/employee', '/employee/time']);
    expect(overflow).toHaveLength(0);
  });

  it('field worker primary includes projects; documents go to More', () => {
    const context = employeeContextFromPreset('field_worker');
    const withAttendance = {
      ...context,
      permissions: new Set([...context.permissions, PERMISSIONS.ATTENDANCE_SELF]),
    };
    const nav = buildEmployeeNavItems(withAttendance);
    const primary = selectEmployeeMobilePrimaryItems(nav);
    const overflow = selectEmployeeMobileOverflowItems(nav);

    expect(hrefs(primary)).toEqual([
      '/employee',
      '/employee/time',
      '/employee/projects',
      '/employee/tasks',
    ]);
    expect(hrefs(overflow)).toEqual(['/employee/documents']);
  });

  it('uses short attendance label on mobile only', () => {
    const nav = buildEmployeeNavItems(employeeContextFromPreset('foreman'));
    const timeItem = nav.find((item) => item.href === '/employee/time')!;

    expect(timeItem.labelKey).toBe('employeeApp.nav.timeAndAttendance');
    expect(employeeMobileNavLabelKey(timeItem)).toBe('employeeApp.nav.attendance');
  });
});

describe('employee management navigation grouping', () => {
  it('office_admin preset shows management nav items grouped', () => {
    const context = employeeContextFromPreset('office_admin');
    const nav = buildEmployeeNavItems(context);

    expect(hasEmployeeManagementNav(context)).toBe(true);
    expect(visibleManagementHrefs(nav).sort()).toEqual(
      [
        '/employee/clients',
        '/employee/billing',
        '/employee/contracts',
        '/employee/expenses',
        '/employee/vendors',
        '/employee/ap',
      ].sort(),
    );

    const { planner, management } = partitionEmployeeNavItems(nav);
    expect(hrefs(planner)).toEqual([
      '/employee',
      '/employee/time',
      '/employee/projects',
      '/employee/tasks',
      '/employee/team',
      '/employee/meetings',
      '/employee/documents',
      '/employee/forms',
    ]);
    expect(hrefs(management).sort()).toEqual(visibleManagementHrefs(nav).sort());
    expect(
      nav.filter((item) => item.visible && item.group === 'planner').length,
    ).toBeGreaterThan(0);
  });

  it('field_worker has no management items', () => {
    const context = employeeContextFromPreset('field_worker');
    const nav = buildEmployeeNavItems(context);

    expect(hasEmployeeManagementNav(context)).toBe(false);
    expect(visibleManagementHrefs(nav)).toEqual([]);
    expect(partitionEmployeeNavItems(nav).management).toEqual([]);
  });

  it('management items appear in overflow on mobile for office preset', () => {
    const context = employeeContextFromPreset('office_admin');
    const nav = buildEmployeeNavItems(context);
    const overflow = selectEmployeeMobileOverflowItems(nav);
    const { management } = partitionEmployeeNavItems(overflow);

    expect(management.length).toBeGreaterThan(0);
    expect(hrefs(management).sort()).toEqual(visibleManagementHrefs(nav).sort());
    expect(
      management.every((item) =>
        (EMPLOYEE_MANAGEMENT_NAV_HREFS as readonly string[]).includes(item.href),
      ),
    ).toBe(true);
  });
});
