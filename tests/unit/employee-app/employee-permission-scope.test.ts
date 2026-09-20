import { describe, expect, it, vi } from 'vitest';
import type { OrgContext } from '@/shared/auth/context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { resolveEmployeeAppEffectivePermissions } from '@/modules/employee-app/application/enrich-context';
import { grantsMapFromPreset } from '@/modules/employee-app/application/permission-editor';
import {
  employeeCanExerciseTaskPermission,
  employeeCanUpdateTaskGrant,
} from '@/modules/employee-app/application/task-permission-scope';
import { resolveAccessibleProjectIdsForUser } from '@/modules/employee-app/application/project-scope';

function contextFromGrants(
  grants: Array<{ permissionKey: (typeof PERMISSIONS)[keyof typeof PERMISSIONS]; scope: 'self_only' | 'assigned_only' | 'all_organization' }>,
): OrgContext {
  const grantMap = grantsMapFromPreset('custom');
  for (const grant of grants) {
    grantMap.set(grant.permissionKey, {
      permissionKey: grant.permissionKey,
      scope: grant.scope,
      granted: true,
    });
  }
  const permissions = resolveEmployeeAppEffectivePermissions(grantMap);
  return {
    userId: 'user-1',
    organizationId: 'org-1',
    membershipId: 'mem-1',
    locale: 'he-IL',
    db: {
      select: vi.fn().mockReturnValue({
        from: vi.fn().mockReturnValue({
          where: vi.fn().mockResolvedValue([{ id: 'assign-1' }]),
        }),
      }),
    } as unknown as OrgContext['db'],
    organization: { id: 'org-1', name: 'Org', timezone: 'Asia/Jerusalem' } as OrgContext['organization'],
    permissions,
    roleKeys: ['employee'],
    employeeApp: {
      employeeId: 'emp-self',
      grants: grantMap,
      allowedDocumentCategories: null,
      account: {
        id: 'acc-1',
        organizationId: 'org-1',
        employeeId: 'emp-self',
        userId: 'user-1',
        status: 'active',
        username: 'demo',
        usernameNormalized: 'demo',
        authEmail: 'demo@employee.local',
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

describe('employee task permission scope', () => {
  it('manage_all grant enables update without tasks.update', () => {
    const context = contextFromGrants([
      { permissionKey: PERMISSIONS.TASKS_MANAGE_ALL, scope: 'assigned_only' },
    ]);
    expect(employeeCanUpdateTaskGrant(context)).toBe(true);
  });

  it('read assigned_only + update self_only uses update scope independently', async () => {
    const context = contextFromGrants([
      { permissionKey: PERMISSIONS.TASKS_READ, scope: 'assigned_only' },
      { permissionKey: PERMISSIONS.TASKS_UPDATE, scope: 'self_only' },
    ]);

    const canUpdateAssignedTask = await employeeCanExerciseTaskPermission(
      context,
      PERMISSIONS.TASKS_UPDATE,
      { taskId: 'task-1', projectId: 'proj-1' },
      'emp-self',
    );
    expect(canUpdateAssignedTask).toBe(true);
  });
});

describe('employee project access resolver', () => {
  it('projects.read all_organization returns unrestricted list (null)', async () => {
    const context = contextFromGrants([
      { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'all_organization' },
    ]);
    await expect(resolveAccessibleProjectIdsForUser(context)).resolves.toBeNull();
  });

  it('projects.read assigned_only returns empty when no assignments helper returns []', async () => {
    const context: OrgContext = {
      ...contextFromGrants([
        { permissionKey: PERMISSIONS.PROJECTS_READ, scope: 'assigned_only' },
      ]),
      db: {
        select: vi.fn().mockReturnValue({
          from: vi.fn().mockReturnValue({
            where: vi.fn().mockResolvedValue([]),
          }),
        }),
      } as unknown as OrgContext['db'],
    };

    await expect(resolveAccessibleProjectIdsForUser(context)).resolves.toEqual([]);
  });
});
