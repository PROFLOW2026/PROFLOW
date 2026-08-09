import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS, type PermissionKey } from '@/shared/permissions/catalog';
import { TOGGLEABLE_PERMISSIONS, type RoleTemplateKey } from '@/shared/permissions/role-templates';
import type { OrgContext } from '@/shared/auth/context';
import {
  findRoleByKey,
  grantPermissionToRole,
  listRolePermissions,
  revokePermissionFromRole,
} from '../data/roles.repository';

/**
 * The limited V1 role editing surface (decision H1): an owner may flip a small
 * set of documented toggles, most usefully giving a project manager visibility
 * of profit. The full role builder is deferred.
 */
export async function setRolePermissionToggle(
  context: OrgContext,
  input: { roleKey: string; permission: PermissionKey; enabled: boolean },
): Promise<void> {
  assertPermission(context, PERMISSIONS.ROLES_MANAGE);

  const role = await findRoleByKey(context.db, context.organizationId, input.roleKey);
  if (!role) throw new NotFoundError('Role');

  if (role.isProtected) {
    throw new DomainRuleError(
      'The owner role cannot be modified',
      'errors.roles.ownerRoleImmutable',
      { roleKey: role.key },
    );
  }

  const templateKey = (role.templateKey ?? role.key) as RoleTemplateKey;
  const allowed = TOGGLEABLE_PERMISSIONS[templateKey] ?? [];

  if (!allowed.includes(input.permission)) {
    throw new DomainRuleError(
      `Permission ${input.permission} is not adjustable for role ${role.key} in V1`,
      'errors.roles.permissionNotToggleable',
      { roleKey: role.key, permission: input.permission },
    );
  }

  const before = await listRolePermissions(context.db, role.id);

  if (input.enabled) {
    await grantPermissionToRole(context.db, {
      organizationId: context.organizationId,
      roleId: role.id,
      permissionKey: input.permission,
    });
  } else {
    await revokePermissionFromRole(context.db, { roleId: role.id, permissionKeys: [input.permission] });
  }

  const after = await listRolePermissions(context.db, role.id);

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.ROLE_PERMISSION_CHANGED,
    entityType: 'role',
    entityId: role.id,
    before: { permissions: before },
    after: { permissions: after },
    metadata: { roleKey: role.key, permission: input.permission, enabled: input.enabled },
  });
}
