import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveEmployeeAppEffectivePermissions } from '@/modules/employee-app/application/enrich-context';
import {
  buildEmployeeNavItems,
  hasEmployeeManagementNav,
} from '@/modules/employee-app/application/get-employee-shell';
import { partitionEmployeeNavItems } from '@/modules/employee-app/application/employee-navigation';
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

function visibleHrefs(context: OrgContext): string[] {
  return buildEmployeeNavItems(context)
    .filter((item) => item.visible)
    .map((item) => item.href);
}

describe('Management / Office persona navigation', () => {
  it('FIELD — planner only, no management section', () => {
    const context = employeeContextFromPreset('field_worker');
    const nav = buildEmployeeNavItems(context);
    const hrefs = visibleHrefs(context);

    expect(hasEmployeeManagementNav(context)).toBe(false);
    expect(partitionEmployeeNavItems(nav).management).toHaveLength(0);
    expect(hrefs).toContain('/employee');
    expect(hrefs).toContain('/employee/projects');
    expect(hrefs).toContain('/employee/tasks');
    expect(hrefs).toContain('/employee/documents');
    expect(hrefs).not.toContain('/employee/billing');
    expect(hrefs).not.toContain('/employee/clients');
  });

  it('PM — planner + assigned scope, optional financials grant, no office finance by default', () => {
    const context = employeeContextFromPreset('project_manager');
    const nav = buildEmployeeNavItems(context);

    expect(hasEmployeeManagementNav(context)).toBe(false);
    expect(context.permissions.has(PERMISSIONS.PROJECT_FINANCIALS_READ)).toBe(true);
    expect(context.permissions.has(PERMISSIONS.BILLING_READ)).toBe(false);
    expect(visibleHrefs(context)).toContain('/employee/projects');
    expect(visibleHrefs(context)).toContain('/employee/tasks');
    expect(visibleHrefs(context)).toContain('/employee/team');
    expect(partitionEmployeeNavItems(nav).planner.length).toBeGreaterThan(0);
  });

  it('ENGINEER/CONSULTANT — planner on assigned/granted projects, no management unless granted', () => {
    const engineer = employeeContextFromPreset('technical_professional');
    const consultant = employeeContextFromPreset('external_consultant');

    expect(hasEmployeeManagementNav(engineer)).toBe(false);
    expect(hasEmployeeManagementNav(consultant)).toBe(false);
    expect(visibleHrefs(engineer)).toContain('/employee/projects');
    expect(visibleHrefs(consultant)).toContain('/employee/projects');
    expect(visibleHrefs(consultant)).not.toContain('/employee/clients');
  });

  it('OFFICE — management modules visible when office_admin grants present', () => {
    const context = employeeContextFromPreset('office_admin');
    const { planner, management } = partitionEmployeeNavItems(buildEmployeeNavItems(context));

    expect(hasEmployeeManagementNav(context)).toBe(true);
    expect(planner.length).toBeGreaterThan(0);
    expect(management.map((item) => item.href).sort()).toEqual(
      [
        '/employee/ap',
        '/employee/billing',
        '/employee/clients',
        '/employee/contracts',
        '/employee/expenses',
        '/employee/vendors',
      ].sort(),
    );
  });

  it('MANAGEMENT preset — broad planner + management finance modules', () => {
    const context = employeeContextFromPreset('management');
    const hrefs = visibleHrefs(context);

    expect(hasEmployeeManagementNav(context)).toBe(true);
    expect(hrefs).toContain('/employee/clients');
    expect(hrefs).toContain('/employee/billing');
    expect(hrefs).toContain('/employee/contracts');
    expect(hrefs).toContain('/employee/ap');
    expect(hrefs).toContain('/employee/procurement');
    expect(context.permissions.has(PERMISSIONS.PROJECT_PROFIT_READ)).toBe(true);
  });

  it('NEGATIVE — no business modules without explicit grants', () => {
    const context = employeeContextFromPreset('read_only_project');
    const hrefs = visibleHrefs(context);

    expect(hasEmployeeManagementNav(context)).toBe(false);
    expect(hrefs).not.toContain('/employee/billing');
    expect(hrefs).not.toContain('/employee/clients');
    expect(hrefs).not.toContain('/employee/expenses');
    expect(hrefs).not.toContain('/employee/ap');
  });
});
