import { and, eq } from 'drizzle-orm';
import { rolePermissions, roles } from '@drizzle/schema';
import type { PermissionKey } from '@/shared/permissions/catalog';
import type { TestDatabase } from './database';

/**
 * Track B (financial projection) fixtures. Adds an org permission to a stock role of one
 * organization, the way an Owner toggles it in role settings (e.g. worker + vendors.read).
 */
export async function grantRolePermission(
  database: TestDatabase,
  organizationId: string,
  roleKey: string,
  permission: PermissionKey,
): Promise<void> {
  await database.asService(async (db) => {
    const [role] = await db
      .select({ id: roles.id })
      .from(roles)
      .where(and(eq(roles.organizationId, organizationId), eq(roles.key, roleKey)))
      .limit(1);
    if (!role) throw new Error(`Role ${roleKey} missing`);
    await db
      .insert(rolePermissions)
      .values({ organizationId, roleId: role.id, permissionKey: permission })
      .onConflictDoNothing();
  });
}
