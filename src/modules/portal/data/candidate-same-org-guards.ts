/**
 * APP GUARDS for vendor portal candidates.
 * Vendor + grant same-org; principal must match grant.principal_id
 * (principals have no organization_id — intentional).
 */

import { and, eq } from 'drizzle-orm';
import { externalAccessGrants, vendors } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { DomainRuleError } from '@/shared/errors';

export async function assertVendorSameOrg(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<void> {
  const [row] = await db
    .select({ id: vendors.id })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId)))
    .limit(1);
  if (!row) {
    throw new DomainRuleError(
      'Vendor does not belong to this organization',
      'portal.errors.vendorOrgMismatch',
    );
  }
}

export async function assertGrantSameOrgAndPrincipal(input: {
  readonly db: DbExecutor;
  readonly organizationId: string;
  readonly grantId: string;
  readonly vendorId: string;
  readonly principalId: string;
}): Promise<void> {
  const [grant] = await input.db
    .select({
      id: externalAccessGrants.id,
      organizationId: externalAccessGrants.organizationId,
      vendorId: externalAccessGrants.vendorId,
      principalId: externalAccessGrants.principalId,
      portalKind: externalAccessGrants.portalKind,
    })
    .from(externalAccessGrants)
    .where(
      and(
        eq(externalAccessGrants.id, input.grantId),
        eq(externalAccessGrants.organizationId, input.organizationId),
      ),
    )
    .limit(1);

  if (!grant) {
    throw new DomainRuleError(
      'Portal grant does not belong to this organization',
      'portal.errors.grantOrgMismatch',
    );
  }
  if (grant.portalKind !== 'vendor' || grant.vendorId !== input.vendorId) {
    throw new DomainRuleError(
      'Portal grant does not cover this vendor',
      'errors.notAllowed',
    );
  }
  // Principals are global (no org) — candidate principal_id must match grant.
  if (grant.principalId !== input.principalId) {
    throw new DomainRuleError(
      'Candidate principal must match grant principal',
      'portal.errors.principalGrantMismatch',
    );
  }
}
