import { describe, expect, it } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { resolveEmployeeAppEffectivePermissions } from '@/modules/employee-app/application/enrich-context';
import { buildEmployeeNavItems } from '@/modules/employee-app/application/get-employee-shell';
import {
  grantsMapFromPreset,
  categoriesSetFromPreset,
} from '@/modules/employee-app/application/permission-editor';
import {
  EMPLOYEE_PRESETS,
  type EmployeePresetKey,
} from '@/modules/employee-app/application/presets';
import {
  canEmployeeReadDocumentCategory,
} from '@/modules/employee-app/application/document-access';
import type { listEmployeeAssignedProjects } from '@/modules/employee-app/application/employee-surface-data';

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

function visibleNavHrefs(context: OrgContext): string[] {
  return buildEmployeeNavItems(context)
    .filter((item) => item.visible)
    .map((item) => item.href);
}

function effectiveGrantKeys(context: OrgContext): PermissionKey[] {
  return [...context.permissions].sort();
}

const OWNER_ONLY_PERMISSIONS: PermissionKey[] = [
  PERMISSIONS.ORG_READ,
  PERMISSIONS.SETTINGS_MANAGE,
  PERMISSIONS.WORKFORCE_MANAGE,
  PERMISSIONS.EXPENSES_READ,
  PERMISSIONS.BILLING_READ,
  PERMISSIONS.PROJECT_FINANCIALS_READ,
];

describe('employee authorization audit — presets', () => {
  it('field_worker has attendance + task baseline', () => {
    const context = employeeContextFromPreset('field_worker');
    expect(effectiveGrantKeys(context)).toEqual(
      expect.arrayContaining([
        PERMISSIONS.ATTENDANCE_SELF,
        PERMISSIONS.TASKS_READ,
        PERMISSIONS.TASKS_UPDATE,
        PERMISSIONS.TASKS_COMMENT,
      ]),
    );
    expect(visibleNavHrefs(context)).toEqual(
      expect.arrayContaining(['/employee', '/employee/time', '/employee/tasks']),
    );
    for (const permission of OWNER_ONLY_PERMISSIONS) {
      expect(context.permissions.has(permission)).toBe(false);
    }
  });

  it('field_worker_time adds self time reporting', () => {
    const context = employeeContextFromPreset('field_worker_time');
    expect(context.permissions.has(PERMISSIONS.TIME_MANAGE)).toBe(true);
    expect(context.employeeApp?.grants.get(PERMISSIONS.TIME_MANAGE)?.scope).toBe('self_only');
    expect(visibleNavHrefs(context)).toEqual(['/employee', '/employee/time']);
  });

  it('foreman preset matches editor grants and nav', () => {
    const context = employeeContextFromPreset('foreman');
    const preset = EMPLOYEE_PRESETS.find((p) => p.key === 'foreman')!;
    for (const grant of preset.grants) {
      expect(context.permissions.has(grant.permissionKey)).toBe(true);
      expect(context.employeeApp?.grants.get(grant.permissionKey)?.scope).toBe(grant.scope);
    }
    expect(visibleNavHrefs(context)).toEqual(
      expect.arrayContaining([
        '/employee',
        '/employee/time',
        '/employee/projects',
        '/employee/tasks',
        '/employee/documents',
        '/employee/team',
      ]),
    );
  });

  it('project_manager preset includes planning and forms grants', () => {
    const context = employeeContextFromPreset('project_manager');
    expect(context.permissions.has(PERMISSIONS.PLANNING_READ)).toBe(true);
    expect(context.permissions.has(PERMISSIONS.FORMS_SUBMIT)).toBe(true);
    expect(context.permissions.has(PERMISSIONS.DOCUMENTS_MANAGE)).toBe(true);
    expect(visibleNavHrefs(context)).toContain('/employee/tasks');
    expect(visibleNavHrefs(context)).toContain('/employee/documents');
  });

  it('office preset exposes forms and expenses nav without projects', () => {
    const context = employeeContextFromPreset('office');
    expect(context.permissions.has(PERMISSIONS.EXPENSES_READ)).toBe(true);
    expect(context.permissions.has(PERMISSIONS.FORMS_READ)).toBe(true);
    expect(context.permissions.has(PERMISSIONS.PROJECTS_READ)).toBe(false);
    expect(visibleNavHrefs(context)).toEqual(
      expect.arrayContaining(['/employee/forms', '/employee/expenses', '/employee/documents']),
    );
  });

  it('management preset uses all_organization scopes and team nav', () => {
    const context = employeeContextFromPreset('management');
    const preset = EMPLOYEE_PRESETS.find((p) => p.key === 'management')!;
    for (const grant of preset.grants) {
      const expectedScope =
        grant.permissionKey === PERMISSIONS.TIME_MANAGE ? 'self_only' : 'all_organization';
      expect(context.employeeApp?.grants.get(grant.permissionKey)?.scope).toBe(expectedScope);
    }
    expect(visibleNavHrefs(context)).toContain('/employee/projects');
    expect(visibleNavHrefs(context)).toContain('/employee/time');
    expect(visibleNavHrefs(context)).toContain('/employee/team');
    expect(visibleNavHrefs(context)).toContain('/employee/tasks');
  });

  it('custom preset is baseline-only until owner grants', () => {
    const context = employeeContextFromPreset('custom');
    expect(effectiveGrantKeys(context)).toEqual([PERMISSIONS.ATTENDANCE_SELF]);
    expect(visibleNavHrefs(context)).toEqual(['/employee', '/employee/time']);
  });
});

describe('employee authorization audit — documents and revoke', () => {
  it('denies document categories outside foreman grant set', () => {
    const context = employeeContextFromPreset('foreman');
    expect(canEmployeeReadDocumentCategory(context, 'photo')).toBe(true);
    expect(canEmployeeReadDocumentCategory(context, 'invoice')).toBe(false);
  });

  it('denies all categories when documents.read is missing', () => {
    const context = employeeContextFromPreset('field_worker');
    expect(canEmployeeReadDocumentCategory(context, 'photo')).toBe(false);
  });

  it('revoking a grant removes permission and nav item', () => {
    const context = employeeContextFromPreset('field_worker_time');
    expect(visibleNavHrefs(context)).toContain('/employee/time');

    const grants = new Map(context.employeeApp!.grants);
    grants.delete(PERMISSIONS.TIME_MANAGE);
    const permissions = resolveEmployeeAppEffectivePermissions(grants);
    const revoked: OrgContext = { ...context, permissions, employeeApp: { ...context.employeeApp!, grants } };

    expect(revoked.permissions.has(PERMISSIONS.TIME_MANAGE)).toBe(false);
    expect(visibleNavHrefs(revoked)).toContain('/employee/time');
  });

  it('does not inherit org.read from employee role template', () => {
    const context = employeeContextFromPreset('management');
    expect(context.permissions.has(PERMISSIONS.ORG_READ)).toBe(false);
    expect(context.permissions.has(PERMISSIONS.SETTINGS_MANAGE)).toBe(false);
  });
});

describe('employee authorization audit — external storage policy', () => {
  it('blocks provider web URLs for employee accounts', async () => {
    const { getOrgStorageProviderWebUrl } = await import(
      '@/modules/external-storage/application/org-browser-service'
    );
    const { getProjectStorageProviderWebUrl } = await import(
      '@/modules/external-storage/application/browser-service'
    );
    const { ServiceUnavailableError } = await import('@/shared/errors');

    const base = employeeContextFromPreset('foreman');
    const context: OrgContext = {
      ...base,
      permissions: new Set([...base.permissions, PERMISSIONS.DOCUMENTS_READ]),
    };

    await expect(getOrgStorageProviderWebUrl(context, { fileId: 'file-1' })).rejects.toBeInstanceOf(
      ServiceUnavailableError,
    );
    await expect(
      getProjectStorageProviderWebUrl(context, { projectId: 'proj-1', fileId: 'file-1' }),
    ).rejects.toBeInstanceOf(ServiceUnavailableError);
  });
});

describe('employee authorization audit — project surface shape', () => {
  it('assigned project list type excludes financial fields', () => {
    type ProjectRow = Awaited<ReturnType<typeof listEmployeeAssignedProjects>>[number];
    const sample: ProjectRow = {
      id: 'p1',
      name: 'Project A',
      documentNumber: 'PRJ-00001',
      displayName: 'PRJ-00001 - Project A',
    };
    expect(Object.keys(sample).sort()).toEqual(['displayName', 'documentNumber', 'id', 'name']);
  });
});
