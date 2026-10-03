import { and, eq } from 'drizzle-orm';
import { externalAccessGrants } from '@drizzle/schema';
import type { Transaction } from '@/shared/db/types';
import type { ExternalContext, ExternalGrantView } from '@/shared/external';
import type { TestDatabase } from './database';
import type { ContractorFixture } from './dg-fixtures';

/**
 * Track H helper: loads the contractor's grants as service role BEFORE opening the contractor's
 * RLS-bound transaction (PGlite is single-session, so no service query runs inside it), then hands
 * the use-case an ExternalContext bound to that transaction.
 */
export async function asContractor<T>(
  database: TestDatabase,
  contractor: ContractorFixture,
  organizationId: string,
  fn: (ctx: ExternalContext, tx: Transaction) => Promise<T>,
): Promise<T> {
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
  return database.asUser(contractor.authUser.id, (tx) =>
    fn(
      {
        principalId: contractor.principalId,
        authUserId: contractor.authUser.id,
        displayName: null,
        locale: 'he-IL',
        grants,
        db: tx,
      },
      tx,
    ),
  );
}
