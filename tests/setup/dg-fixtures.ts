import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import {
  externalAccessGrants,
  externalPrincipals,
  organizationMemberships,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import { createProject } from '@/modules/projects';
import { assignRole, findRoleByKey } from '@/modules/rbac';
import { resolveOrgContext } from '@/modules/tenancy';
import type { OrgContext } from '@/shared/auth/context';
import type { Transaction } from '@/shared/db/types';
import {
  ALL_EXTERNAL_CAPABILITIES,
  type ExternalContext,
  type ExternalGrantView,
} from '@/shared/external';
import { createTestUser, type TestUser } from './fixtures';
import type { TestDatabase } from './database';

/**
 * Shared fixtures for the Developer / GC build (MAIN AGENT owned). Tracks reuse these instead of
 * inventing their own seed helpers.
 */

/** Active org member (internal user) with a stock role (default `worker`). */
export async function addOrgMember(
  database: TestDatabase,
  organizationId: string,
  label: string,
  roleKey = 'worker',
): Promise<TestUser> {
  const user = await createTestUser(database, `${label}-${randomUUID().slice(0, 6)}@example.test`);
  await database.asService(async (db) => {
    const membershipId = randomUUID();
    await db.insert(organizationMemberships).values({
      id: membershipId,
      organizationId,
      userId: user.id,
      status: 'active',
    });
    const role = await findRoleByKey(db, organizationId, roleKey);
    if (!role) throw new Error(`Role ${roleKey} missing`);
    await assignRole(db, { organizationId, membershipId, userId: user.id, roleId: role.id });
  });
  return user;
}

export function orgContextFor(tx: Transaction, userId: string, organizationId: string): Promise<OrgContext> {
  return resolveOrgContext(tx, { userId, organizationId, locale: 'en' });
}

export async function createProjectAs(
  database: TestDatabase,
  userId: string,
  organizationId: string,
  name: string,
): Promise<string> {
  return database.asUser(userId, async (tx) => {
    const context = await orgContextFor(tx, userId, organizationId);
    const created = await createProject(context, { name });
    return created.projectId;
  });
}

export interface ContractorFixture {
  readonly principalId: string;
  /** The principal's own auth user (profiles row). NOT an org member. */
  readonly authUser: TestUser;
  readonly vendorId: string;
  readonly agreementId: string | null;
  readonly grantId: string;
}

export interface CreateContractorOptions {
  readonly organizationId: string;
  readonly projectId: string;
  readonly label: string;
  readonly capabilities?: readonly string[];
  /** Create a subcontract agreement for the vendor on the project (default true). */
  readonly withAgreement?: boolean;
  /** Narrow the grant to the agreement (default false: vendor-wide grant). */
  readonly narrowToAgreement?: boolean;
  /** Narrow the grant to the project (default false). */
  readonly narrowToProject?: boolean;
  readonly agreementAmount?: string;
  /** Reuse an existing vendor (e.g. a second principal of the same company). */
  readonly vendorId?: string;
}

/** Vendor + (optional) agreement + external principal (own auth user) + contractor grant. */
export async function createContractor(
  database: TestDatabase,
  options: CreateContractorOptions,
): Promise<ContractorFixture> {
  const authUser = await createTestUser(
    database,
    `ext-${options.label}-${randomUUID().slice(0, 6)}@example.test`,
  );
  return database.asService(async (db) => {
    const vendorId =
      options.vendorId ??
      (
        await db
          .insert(vendors)
          .values({ organizationId: options.organizationId, name: `Contractor ${options.label}`, type: 'subcontractor' })
          .returning({ id: vendors.id })
      )[0]!.id;

    let agreementId: string | null = null;
    if (options.withAgreement ?? true) {
      const [agreement] = await db
        .insert(subcontractAgreements)
        .values({
          organizationId: options.organizationId,
          vendorId,
          projectId: options.projectId,
          title: `Agreement ${options.label}`,
          status: 'active',
          originalAmount: options.agreementAmount ?? '100000',
          currency: 'ILS',
        })
        .returning({ id: subcontractAgreements.id });
      agreementId = agreement!.id;
    }

    const [principal] = await db
      .insert(externalPrincipals)
      .values({ email: authUser.email, displayName: options.label, authUserId: authUser.id })
      .returning({ id: externalPrincipals.id });

    const [grant] = await db
      .insert(externalAccessGrants)
      .values({
        organizationId: options.organizationId,
        principalId: principal!.id,
        portalKind: 'contractor',
        vendorId,
        projectId: options.narrowToProject ? options.projectId : null,
        subcontractAgreementId: options.narrowToAgreement ? agreementId : null,
        scopes: [...(options.capabilities ?? ALL_EXTERNAL_CAPABILITIES)],
        status: 'active',
      })
      .returning({ id: externalAccessGrants.id });

    return { principalId: principal!.id, authUser, vendorId, agreementId, grantId: grant!.id };
  });
}

/**
 * Builds an ExternalContext for a fixture contractor (grants read as service role, `db` is the RLS-bound
 * transaction of the external user). Production code uses the track-B session loader instead.
 */
export async function externalContextFor(
  database: TestDatabase,
  tx: Transaction,
  contractor: ContractorFixture,
  organizationId: string,
): Promise<ExternalContext> {
  const rows = await database.asService((db) =>
    db
      .select()
      .from(externalAccessGrants)
      .where(
        and(
          eq(externalAccessGrants.principalId, contractor.principalId),
          eq(externalAccessGrants.organizationId, organizationId),
          eq(externalAccessGrants.status, 'active'),
        ),
      ),
  );
  const grants: ExternalGrantView[] = rows.map((row) => ({
    grantId: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId!,
    projectId: row.projectId,
    subcontractAgreementId: row.subcontractAgreementId,
    capabilities: new Set(row.scopes),
    expiresAt: row.expiresAt,
  }));
  return {
    principalId: contractor.principalId,
    authUserId: contractor.authUser.id,
    displayName: null,
    locale: 'en',
    grants,
    db: tx,
  };
}
