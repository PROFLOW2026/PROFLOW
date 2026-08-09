import { and, eq, sql } from 'drizzle-orm';
import { organizationMemberships, profiles, roleAssignments, roles } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';

/** Membership administration (doc 73 §7). */

export interface OrganizationMember {
  readonly membershipId: string;
  readonly userId: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly status: 'active' | 'invited' | 'suspended';
  readonly roleKeys: string[];
}

export async function listOrganizationMembers(context: OrgContext): Promise<OrganizationMember[]> {
  assertPermission(context, PERMISSIONS.MEMBERS_READ);

  const rows = await context.db
    .select({
      membershipId: organizationMemberships.id,
      userId: organizationMemberships.userId,
      email: profiles.email,
      displayName: profiles.displayName,
      status: organizationMemberships.status,
      roleKey: roles.key,
    })
    .from(organizationMemberships)
    .innerJoin(profiles, eq(profiles.id, organizationMemberships.userId))
    .leftJoin(
      roleAssignments,
      and(
        eq(roleAssignments.membershipId, organizationMemberships.id),
        eq(roleAssignments.organizationId, context.organizationId),
      ),
    )
    .leftJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(eq(organizationMemberships.organizationId, context.organizationId))
    .orderBy(profiles.displayName, profiles.email);

  // One row per membership/role pair collapses into one member with many roles.
  const byMembership = new Map<string, OrganizationMember>();

  for (const row of rows) {
    const existing = byMembership.get(row.membershipId);
    if (existing) {
      if (row.roleKey && !existing.roleKeys.includes(row.roleKey)) {
        byMembership.set(row.membershipId, {
          ...existing,
          roleKeys: [...existing.roleKeys, row.roleKey],
        });
      }
      continue;
    }

    byMembership.set(row.membershipId, {
      membershipId: row.membershipId,
      userId: row.userId,
      email: row.email,
      displayName: row.displayName,
      status: row.status,
      roleKeys: row.roleKey ? [row.roleKey] : [],
    });
  }

  return [...byMembership.values()].filter((member) => member.status === 'active');
}

async function countActiveOwners(context: OrgContext): Promise<number> {
  const [row] = await context.db
    .select({ count: sql<number>`count(distinct ${organizationMemberships.id})::int` })
    .from(organizationMemberships)
    .innerJoin(roleAssignments, eq(roleAssignments.membershipId, organizationMemberships.id))
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(
      and(
        eq(organizationMemberships.organizationId, context.organizationId),
        eq(organizationMemberships.status, 'active'),
        eq(roles.key, 'owner'),
      ),
    );

  return row?.count ?? 0;
}

/**
 * Suspends a membership rather than deleting it, so everything the person
 * created keeps its author.
 */
export async function removeMemberAccess(context: OrgContext, membershipId: string): Promise<void> {
  assertPermission(context, PERMISSIONS.MEMBERS_MANAGE);

  const [membership] = await context.db
    .select({
      id: organizationMemberships.id,
      userId: organizationMemberships.userId,
      status: organizationMemberships.status,
    })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.id, membershipId),
        eq(organizationMemberships.organizationId, context.organizationId),
      ),
    )
    .limit(1);

  if (!membership || membership.status !== 'active') throw new NotFoundError('Member');

  if (membership.userId === context.userId) {
    throw new DomainRuleError('You cannot remove your own access', 'errors.notAllowed');
  }

  const roleRows = await context.db
    .select({ roleKey: roles.key })
    .from(roleAssignments)
    .innerJoin(roles, eq(roles.id, roleAssignments.roleId))
    .where(
      and(
        eq(roleAssignments.membershipId, membershipId),
        eq(roleAssignments.organizationId, context.organizationId),
      ),
    );

  // Removing the last owner would leave the organization unadministrable.
  if (roleRows.some((row) => row.roleKey === 'owner')) {
    const ownerCount = await countActiveOwners(context);
    if (ownerCount <= 1) {
      throw new DomainRuleError('The last owner cannot be removed', 'errors.notAllowed');
    }
  }

  await context.db
    .update(organizationMemberships)
    .set({ status: 'suspended' })
    .where(eq(organizationMemberships.id, membershipId));

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MEMBERSHIP_REMOVED,
    entityType: 'membership',
    entityId: membershipId,
    before: { userId: membership.userId, status: 'active' },
    after: { status: 'suspended' },
  });
}
