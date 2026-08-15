import { and, eq } from 'drizzle-orm';
import { organizationMemberships, roleAssignments, rolePermissions } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { PermissionKey } from '@/shared/permissions/catalog';
import { NOTIFICATION_RECIPIENT_FANOUT_CAP } from '../domain/recipients';

export async function listUserIdsWithPermission(
  db: DbExecutor,
  organizationId: string,
  permissionKey: PermissionKey,
  cap: number = NOTIFICATION_RECIPIENT_FANOUT_CAP,
): Promise<string[]> {
  const rows = await db
    .selectDistinct({ userId: roleAssignments.userId })
    .from(roleAssignments)
    .innerJoin(rolePermissions, eq(rolePermissions.roleId, roleAssignments.roleId))
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.id, roleAssignments.membershipId),
        eq(organizationMemberships.organizationId, organizationId),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .where(
      and(
        eq(roleAssignments.organizationId, organizationId),
        eq(rolePermissions.permissionKey, permissionKey),
      ),
    )
    .limit(Math.max(1, cap));

  return rows.map((row) => row.userId).filter((id): id is string => Boolean(id));
}
