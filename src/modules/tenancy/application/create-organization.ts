import { writeAuditEvent, AUDIT_ACTIONS } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import type { OrganizationSummary } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';
import { assignRole, provisionOrganizationRoles } from '@/modules/rbac';
import { defaultsForCountry } from '../domain/organization-defaults';
import { createOrganizationSchema, type CreateOrganizationInput } from '../validation/schemas';
import {
  findOrganizationById,
  insertMembership,
  insertOrganization,
  seedDefaultCostCategories,
} from '../data/organizations.repository';

/**
 * Founds an organization (doc 73 §3).
 *
 * Everything happens in one transaction: organization, the founder's active
 * membership, cloned role templates, the owner grant and the audit entry. A
 * partially provisioned tenant — an organization nobody can administer — must
 * never be reachable.
 *
 * Onboarding asks for a name and a country and nothing else (doc 39 §9).
 */
export interface CreateOrganizationResult {
  readonly organization: OrganizationSummary;
  readonly membershipId: string;
}

export async function createOrganization(
  db: DbExecutor,
  userId: string,
  rawInput: CreateOrganizationInput,
): Promise<CreateOrganizationResult> {
  const parsed = createOrganizationSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const countryDefaults = defaultsForCountry(input.countryCode);

  const organizationId = await insertOrganization(db, {
    name: input.name,
    countryCode: input.countryCode,
    baseCurrency: input.baseCurrency ?? countryDefaults.currency,
    timezone: input.timezone ?? countryDefaults.timezone,
    defaultLocale: input.defaultLocale ?? countryDefaults.locale,
  });

  // The founder's membership must land before anything reads the organization
  // back: until it exists, row-level security correctly hides the new row.
  const membership = await insertMembership(db, {
    organizationId,
    userId,
    status: 'active',
  });

  const organization = await findOrganizationById(db, organizationId);
  if (!organization) {
    throw new Error('The organization could not be read back after it was created.');
  }

  const roleIds = await provisionOrganizationRoles(db, organization.id);

  await assignRole(db, {
    organizationId: organization.id,
    membershipId: membership.id,
    userId,
    roleId: roleIds.owner,
  });

  await seedDefaultCostCategories(db, organization.id);

  await writeAuditEvent(db, {
    organizationId: organization.id,
    actorUserId: userId,
    action: AUDIT_ACTIONS.ORGANIZATION_CREATED,
    entityType: 'organization',
    entityId: organization.id,
    after: organization,
  });

  await writeAuditEvent(db, {
    organizationId: organization.id,
    actorUserId: userId,
    action: AUDIT_ACTIONS.MEMBERSHIP_CREATED,
    entityType: 'organization_membership',
    entityId: membership.id,
    after: { userId, status: 'active', roleKey: 'owner' },
  });

  return { organization, membershipId: membership.id };
}
