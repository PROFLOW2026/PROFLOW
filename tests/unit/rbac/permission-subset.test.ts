import { describe, expect, it } from 'vitest';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { roleTemplate } from '@/shared/permissions/role-templates';
import { findEscalatingPermissions, isPermissionSubset } from '@/modules/rbac';

describe('permission subset guard', () => {
  it('treats identical permission sets as safe', () => {
    const actor = new Set([PERMISSIONS.PROJECTS_READ, PERMISSIONS.INVITATIONS_MANAGE]);
    expect(isPermissionSubset(actor, [PERMISSIONS.PROJECTS_READ, PERMISSIONS.INVITATIONS_MANAGE])).toBe(true);
  });

  it('flags permissions the actor does not hold', () => {
    const managerWithInvites = new Set([
      ...roleTemplate('manager').permissions,
      PERMISSIONS.INVITATIONS_MANAGE,
    ]);
    const financePermissions = roleTemplate('finance').permissions;

    const escalating = findEscalatingPermissions(managerWithInvites, financePermissions);

    expect(escalating).toContain(PERMISSIONS.PROJECT_PROFIT_READ);
    expect(escalating).toContain(PERMISSIONS.BILLING_MANAGE);
    expect(escalating).toContain(PERMISSIONS.TAX_MANAGE);
    expect(escalating).toContain(PERMISSIONS.AUDIT_READ);
    expect(isPermissionSubset(managerWithInvites, financePermissions)).toBe(false);
  });

  it('allows inviting a worker when the actor holds every worker permission', () => {
    const managerWithInvites = new Set([
      ...roleTemplate('manager').permissions,
      PERMISSIONS.INVITATIONS_MANAGE,
    ]);

    expect(isPermissionSubset(managerWithInvites, roleTemplate('worker').permissions)).toBe(true);
  });
});
