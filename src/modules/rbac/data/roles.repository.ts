import { and, eq, inArray } from 'drizzle-orm';
import { rolePermissions, roleAssignments, roles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { isPermissionKey, type PermissionKey } from '@/shared/permissions/catalog';
import { ROLE_TEMPLATES, type RoleTemplateKey } from '@/shared/permissions/role-templates';

/**
 * Role storage (doc 73 §6).
 *
 * Templates are cloned per organization rather than shared, so one owner can
 * adjust their own roles without touching another tenant.
 */

export interface RoleRow {
  id: string;
  key: string;
  templateKey: string | null;
  name: string;
  rank: number;
  isProtected: boolean;
}

/** Clones every system role template into a freshly created organization. */
export async function provisionOrganizationRoles(
  db: DbExecutor,
  organizationId: string,
): Promise<Record<RoleTemplateKey, string>> {
  const inserted = await db
    .insert(roles)
    .values(
      ROLE_TEMPLATES.map((template) => ({
        organizationId,
        key: template.key,
        templateKey: template.key,
        name: template.name,
        description: template.description,
        rank: template.rank,
        isProtected: template.isProtected,
      })),
    )
    .returning({ id: roles.id, key: roles.key });

  const byKey = new Map(inserted.map((role) => [role.key, role.id]));

  const permissionRows = ROLE_TEMPLATES.flatMap((template) => {
    const roleId = byKey.get(template.key);
    if (!roleId) return [];
    return template.permissions.map((permissionKey) => ({
      organizationId,
      roleId,
      permissionKey,
    }));
  });

  if (permissionRows.length > 0) {
    await db.insert(rolePermissions).values(permissionRows).onConflictDoNothing();
  }

  return Object.fromEntries(
    ROLE_TEMPLATES.map((template) => [template.key, byKey.get(template.key)!]),
  ) as Record<RoleTemplateKey, string>;
}

export async function findRoleByKey(
  db: DbExecutor,
  organizationId: string,
  key: string,
): Promise<RoleRow | null> {
  const [row] = await db
    .select({
      id: roles.id,
      key: roles.key,
      templateKey: roles.templateKey,
      name: roles.name,
      rank: roles.rank,
      isProtected: roles.isProtected,
    })
    .from(roles)
    .where(and(eq(roles.organizationId, organizationId), eq(roles.key, key)))
    .limit(1);

  return row ?? null;
}

export async function listOrganizationRoles(db: DbExecutor, organizationId: string): Promise<RoleRow[]> {
  return db
    .select({
      id: roles.id,
      key: roles.key,
      templateKey: roles.templateKey,
      name: roles.name,
      rank: roles.rank,
      isProtected: roles.isProtected,
    })
    .from(roles)
    .where(eq(roles.organizationId, organizationId))
    .orderBy(roles.rank);
}

export async function assignRole(
  db: DbExecutor,
  input: { organizationId: string; membershipId: string; userId: string; roleId: string },
): Promise<void> {
  await db.insert(roleAssignments).values({
    organizationId: input.organizationId,
    membershipId: input.membershipId,
    userId: input.userId,
    roleId: input.roleId,
  });
}

/** Idempotent: skips the insert when this membership already holds the role. */
export async function ensureRoleAssigned(
  db: DbExecutor,
  input: { organizationId: string; membershipId: string; userId: string; roleId: string },
): Promise<void> {
  const [existing] = await db
    .select({ id: roleAssignments.id })
    .from(roleAssignments)
    .where(
      and(
        eq(roleAssignments.organizationId, input.organizationId),
        eq(roleAssignments.membershipId, input.membershipId),
        eq(roleAssignments.roleId, input.roleId),
      ),
    )
    .limit(1);

  if (existing) return;

  await assignRole(db, input);
}

/**
 * Union of the permissions granted by every role the user holds in this
 * organization (doc 73 §7). Project-scoped assignments are reserved but not
 * yet issued in V1, so no scope filtering is applied.
 */
export async function loadEffectivePermissions(
  db: DbExecutor,
  organizationId: string,
  userId: string,
): Promise<{ permissions: Set<PermissionKey>; roleKeys: string[] }> {
  const rows = await db
    .selectDistinct({
      permissionKey: rolePermissions.permissionKey,
      roleKey: roles.key,
    })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roleAssignments.roleId))
    .where(and(eq(roleAssignments.organizationId, organizationId), eq(roleAssignments.userId, userId)));

  const permissions = new Set<PermissionKey>();
  const roleKeys = new Set<string>();

  for (const row of rows) {
    // Guards against a stale key left behind by a removed permission.
    if (isPermissionKey(row.permissionKey)) permissions.add(row.permissionKey);
    roleKeys.add(row.roleKey);
  }

  return { permissions, roleKeys: [...roleKeys] };
}

export async function grantPermissionToRole(
  db: DbExecutor,
  input: { organizationId: string; roleId: string; permissionKey: PermissionKey },
): Promise<void> {
  await db
    .insert(rolePermissions)
    .values({
      organizationId: input.organizationId,
      roleId: input.roleId,
      permissionKey: input.permissionKey,
    })
    .onConflictDoNothing();
}

export async function revokePermissionFromRole(
  db: DbExecutor,
  input: { roleId: string; permissionKeys: readonly PermissionKey[] },
): Promise<void> {
  if (input.permissionKeys.length === 0) return;
  await db
    .delete(rolePermissions)
    .where(
      and(
        eq(rolePermissions.roleId, input.roleId),
        inArray(rolePermissions.permissionKey, [...input.permissionKeys]),
      ),
    );
}

export async function listRolePermissions(db: DbExecutor, roleId: string): Promise<PermissionKey[]> {
  const rows = await db
    .select({ permissionKey: rolePermissions.permissionKey })
    .from(rolePermissions)
    .where(eq(rolePermissions.roleId, roleId));

  return rows.map((row) => row.permissionKey).filter(isPermissionKey);
}
