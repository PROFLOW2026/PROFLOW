import { and, eq } from 'drizzle-orm';
import { externalAccessGrants } from '@drizzle/schema';
import type { Transaction } from '@/shared/db/types';
import type { ExternalContext, ExternalGrantView } from '@/shared/external';
import type { ContractorFixture } from './dg-fixtures';
import type { TestDatabase } from './database';

/**
 * Track E fixtures. Reads the contractor's grants as service role BEFORE the external user's
 * transaction opens (PGlite runs on one connection), then binds the context to that transaction.
 */
export async function externalContextBinder(
  database: TestDatabase,
  contractor: ContractorFixture,
  organizationId: string,
): Promise<(tx: Transaction) => ExternalContext> {
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
  return (tx) => ({
    principalId: contractor.principalId,
    authUserId: contractor.authUser.id,
    displayName: null,
    locale: 'en',
    grants,
    db: tx,
  });
}
