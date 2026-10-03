import { and, eq } from 'drizzle-orm';
import { externalAccessGrants } from '@drizzle/schema';
import type { OrgContext } from '@/shared/auth/context';
import type { ExternalContext, ExternalGrantView } from '@/shared/external';
import type { TestDatabase } from './database';
import { orgContextFor, type ContractorFixture } from './dg-fixtures';

/**
 * Track KL helpers. Grants are read as service role BEFORE the contractor's RLS transaction opens:
 * the PGlite harness serializes queries on one connection, so a service-role read issued while a user
 * transaction is open (as `externalContextFor` does) waits on that transaction forever.
 */

export async function loadContractorGrants(
  database: TestDatabase,
  contractor: ContractorFixture,
  organizationId: string,
): Promise<ExternalGrantView[]> {
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
  return rows.map((row) => ({
    grantId: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId!,
    projectId: row.projectId,
    subcontractAgreementId: row.subcontractAgreementId,
    capabilities: new Set(row.scopes),
    expiresAt: row.expiresAt,
  }));
}

export async function asContractor<T>(
  database: TestDatabase,
  contractor: ContractorFixture,
  organizationId: string,
  fn: (context: ExternalContext) => Promise<T>,
): Promise<T> {
  const grants = await loadContractorGrants(database, contractor, organizationId);
  return database.asUser(contractor.authUser.id, (tx) =>
    fn({
      principalId: contractor.principalId,
      authUserId: contractor.authUser.id,
      displayName: null,
      locale: 'en',
      grants,
      db: tx,
    }),
  );
}

export function asInternal<T>(
  database: TestDatabase,
  userId: string,
  organizationId: string,
  fn: (context: OrgContext) => Promise<T>,
): Promise<T> {
  return database.asUser(userId, async (tx) => fn(await orgContextFor(tx, userId, organizationId)));
}
