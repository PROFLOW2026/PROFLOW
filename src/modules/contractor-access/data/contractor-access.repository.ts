import { and, count, desc, eq, gt, inArray, isNull, ne, or, sql } from 'drizzle-orm';
import {
  contractorGrants,
  contractorPrincipals,
  externalPrincipalTokens,
  externalSignInAttempts,
  subcontractAgreements,
  vendors,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { ContractorTokenPurpose } from '../domain/tokens';

export type ContractorPrincipalRow = typeof contractorPrincipals.$inferSelect;
export type ContractorGrantRow = typeof contractorGrants.$inferSelect;
export type ContractorTokenRow = typeof externalPrincipalTokens.$inferSelect;

// ---------------------------------------------------------------------------
// Principals
// ---------------------------------------------------------------------------

export async function findContractorPrincipalByAuthUser(
  db: DbExecutor,
  authUserId: string,
): Promise<ContractorPrincipalRow | null> {
  const [row] = await db
    .select()
    .from(contractorPrincipals)
    .where(
      and(
        eq(contractorPrincipals.authUserId, authUserId),
        eq(contractorPrincipals.principalKind, 'contractor'),
        isNull(contractorPrincipals.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findContractorPrincipalByUsername(
  db: DbExecutor,
  usernameNormalized: string,
): Promise<ContractorPrincipalRow | null> {
  const [row] = await db
    .select()
    .from(contractorPrincipals)
    .where(
      and(
        eq(contractorPrincipals.usernameNormalized, usernameNormalized),
        eq(contractorPrincipals.principalKind, 'contractor'),
        isNull(contractorPrincipals.archivedAt),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function findContractorPrincipalById(
  db: DbExecutor,
  principalId: string,
): Promise<ContractorPrincipalRow | null> {
  const [row] = await db
    .select()
    .from(contractorPrincipals)
    .where(and(eq(contractorPrincipals.id, principalId), eq(contractorPrincipals.principalKind, 'contractor')))
    .limit(1);
  return row ?? null;
}

export async function isUsernameTaken(db: DbExecutor, usernameNormalized: string): Promise<boolean> {
  const [row] = await db
    .select({ id: contractorPrincipals.id })
    .from(contractorPrincipals)
    .where(eq(contractorPrincipals.usernameNormalized, usernameNormalized))
    .limit(1);
  return Boolean(row);
}

export async function insertContractorPrincipal(
  db: DbExecutor,
  values: typeof contractorPrincipals.$inferInsert,
): Promise<string> {
  const id = values.id ?? crypto.randomUUID();
  await db.insert(contractorPrincipals).values({ ...values, id, principalKind: 'contractor' });
  return id;
}

export async function updateContractorPrincipal(
  db: DbExecutor,
  principalId: string,
  patch: Partial<
    Pick<
      typeof contractorPrincipals.$inferInsert,
      | 'status'
      | 'displayName'
      | 'phone'
      | 'contactEmail'
      | 'locale'
      | 'activatedAt'
      | 'passwordSetAt'
      | 'passwordResetRequestedAt'
      | 'lastSignInAt'
      | 'failedSignInCount'
      | 'lockedUntil'
      | 'sessionsRevokedAt'
      | 'disabledAt'
      | 'disabledByUserId'
    >
  >,
): Promise<void> {
  await db
    .update(contractorPrincipals)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(contractorPrincipals.id, principalId), eq(contractorPrincipals.principalKind, 'contractor')));
}

// ---------------------------------------------------------------------------
// Grants
// ---------------------------------------------------------------------------

export async function listLiveGrantsForPrincipal(
  db: DbExecutor,
  principalId: string,
  now: Date = new Date(),
): Promise<ContractorGrantRow[]> {
  return db
    .select()
    .from(contractorGrants)
    .where(
      and(
        eq(contractorGrants.principalId, principalId),
        eq(contractorGrants.portalKind, 'contractor'),
        eq(contractorGrants.status, 'active'),
        isNull(contractorGrants.revokedAt),
        or(isNull(contractorGrants.expiresAt), gt(contractorGrants.expiresAt, now)),
      ),
    );
}

export async function insertContractorGrant(
  db: DbExecutor,
  values: Omit<typeof contractorGrants.$inferInsert, 'portalKind' | 'status'>,
): Promise<string> {
  const id = values.id ?? crypto.randomUUID();
  await db.insert(contractorGrants).values({ ...values, id, portalKind: 'contractor', status: 'active' });
  return id;
}

export async function findContractorGrant(
  db: DbExecutor,
  organizationId: string,
  grantId: string,
): Promise<ContractorGrantRow | null> {
  const [row] = await db
    .select()
    .from(contractorGrants)
    .where(
      and(
        eq(contractorGrants.id, grantId),
        eq(contractorGrants.organizationId, organizationId),
        eq(contractorGrants.portalKind, 'contractor'),
      ),
    )
    .limit(1);
  return row ?? null;
}

export async function updateContractorGrant(
  db: DbExecutor,
  organizationId: string,
  grantId: string,
  patch: Partial<
    Pick<
      typeof contractorGrants.$inferInsert,
      'scopes' | 'templateKey' | 'expiresAt' | 'status' | 'revokedAt' | 'revokedByUserId' | 'revokeReason' | 'updatedByUserId'
    >
  >,
): Promise<void> {
  await db
    .update(contractorGrants)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(contractorGrants.id, grantId),
        eq(contractorGrants.organizationId, organizationId),
        eq(contractorGrants.portalKind, 'contractor'),
      ),
    );
}

/** Live grants of one principal in one organization (used by revoke-all / disable). */
export async function listOrgGrantsForPrincipal(
  db: DbExecutor,
  organizationId: string,
  principalId: string,
): Promise<ContractorGrantRow[]> {
  return db
    .select()
    .from(contractorGrants)
    .where(
      and(
        eq(contractorGrants.organizationId, organizationId),
        eq(contractorGrants.principalId, principalId),
        eq(contractorGrants.portalKind, 'contractor'),
        eq(contractorGrants.status, 'active'),
      ),
    );
}

export interface ProjectContractorGrantRow {
  readonly grant: ContractorGrantRow;
  readonly principal: ContractorPrincipalRow;
  readonly vendorName: string;
  readonly agreementTitle: string | null;
}

/** Contractor grants that reach this project (project-scoped or vendor-wide), newest first. */
export async function listProjectContractorGrants(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  limit = 200,
): Promise<ProjectContractorGrantRow[]> {
  const rows = await db
    .select({
      grant: contractorGrants,
      principal: contractorPrincipals,
      vendorName: vendors.name,
      agreementTitle: subcontractAgreements.title,
    })
    .from(contractorGrants)
    .innerJoin(contractorPrincipals, eq(contractorPrincipals.id, contractorGrants.principalId))
    .innerJoin(
      vendors,
      and(eq(vendors.id, contractorGrants.vendorId), eq(vendors.organizationId, contractorGrants.organizationId)),
    )
    .leftJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, contractorGrants.subcontractAgreementId),
        eq(subcontractAgreements.organizationId, contractorGrants.organizationId),
      ),
    )
    .where(
      and(
        eq(contractorGrants.organizationId, organizationId),
        eq(contractorGrants.portalKind, 'contractor'),
        or(eq(contractorGrants.projectId, projectId), isNull(contractorGrants.projectId)),
        ne(contractorGrants.status, 'expired'),
        eq(contractorPrincipals.principalKind, 'contractor'),
      ),
    )
    .orderBy(desc(contractorGrants.createdAt))
    .limit(limit);
  return rows.map((row) => ({ ...row, agreementTitle: row.agreementTitle ?? null }));
}

/** Contractor accounts already holding a grant for one of these vendors (for "add access" pickers). */
export async function listOrgContractorPrincipalsForVendors(
  db: DbExecutor,
  organizationId: string,
  vendorIds: readonly string[],
): Promise<Array<{ principalId: string; vendorId: string; displayName: string | null; username: string | null }>> {
  if (vendorIds.length === 0) return [];
  const rows = await db
    .selectDistinct({
      principalId: contractorPrincipals.id,
      vendorId: contractorGrants.vendorId,
      displayName: contractorPrincipals.displayName,
      username: contractorPrincipals.username,
    })
    .from(contractorGrants)
    .innerJoin(contractorPrincipals, eq(contractorPrincipals.id, contractorGrants.principalId))
    .where(
      and(
        eq(contractorGrants.organizationId, organizationId),
        eq(contractorGrants.portalKind, 'contractor'),
        inArray(contractorGrants.vendorId, [...vendorIds]),
        eq(contractorPrincipals.principalKind, 'contractor'),
        ne(contractorPrincipals.status, 'disabled'),
      ),
    )
    .limit(500);
  return rows.map((row) => ({ ...row, vendorId: row.vendorId! }));
}

// ---------------------------------------------------------------------------
// Tokens
// ---------------------------------------------------------------------------

export async function insertContractorToken(
  db: DbExecutor,
  values: {
    organizationId: string;
    projectId: string | null;
    principalId: string;
    purpose: ContractorTokenPurpose;
    tokenHash: string;
    expiresAt: Date;
    createdByUserId: string | null;
  },
): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(externalPrincipalTokens).values({ id, ...values });
  return id;
}

export async function findContractorTokenByHash(db: DbExecutor, tokenHash: string): Promise<ContractorTokenRow | null> {
  const [row] = await db
    .select()
    .from(externalPrincipalTokens)
    .where(eq(externalPrincipalTokens.tokenHash, tokenHash))
    .limit(1);
  return row ?? null;
}

/** Single use: only the first consumer wins (returns false if the token was already used/revoked). */
export async function consumeContractorToken(db: DbExecutor, tokenId: string, now: Date = new Date()): Promise<boolean> {
  const rows = await db
    .update(externalPrincipalTokens)
    .set({ consumedAt: now })
    .where(
      and(
        eq(externalPrincipalTokens.id, tokenId),
        isNull(externalPrincipalTokens.consumedAt),
        isNull(externalPrincipalTokens.revokedAt),
        gt(externalPrincipalTokens.expiresAt, now),
      ),
    )
    .returning({ id: externalPrincipalTokens.id });
  return rows.length === 1;
}

export async function revokeOpenContractorTokens(
  db: DbExecutor,
  principalId: string,
  purpose?: ContractorTokenPurpose,
  now: Date = new Date(),
): Promise<void> {
  await db
    .update(externalPrincipalTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(externalPrincipalTokens.principalId, principalId),
        isNull(externalPrincipalTokens.consumedAt),
        isNull(externalPrincipalTokens.revokedAt),
        purpose ? eq(externalPrincipalTokens.purpose, purpose) : sql`true`,
      ),
    );
}

export async function latestOpenTokenExpiry(
  db: DbExecutor,
  principalIds: readonly string[],
  now: Date = new Date(),
): Promise<Map<string, { purpose: string; expiresAt: Date }>> {
  if (principalIds.length === 0) return new Map();
  const rows = await db
    .select({
      principalId: externalPrincipalTokens.principalId,
      purpose: externalPrincipalTokens.purpose,
      expiresAt: externalPrincipalTokens.expiresAt,
    })
    .from(externalPrincipalTokens)
    .where(
      and(
        inArray(externalPrincipalTokens.principalId, [...principalIds]),
        isNull(externalPrincipalTokens.consumedAt),
        isNull(externalPrincipalTokens.revokedAt),
        gt(externalPrincipalTokens.expiresAt, now),
      ),
    )
    .orderBy(desc(externalPrincipalTokens.createdAt))
    .limit(principalIds.length * 4);
  const map = new Map<string, { purpose: string; expiresAt: Date }>();
  for (const row of rows) {
    if (!map.has(row.principalId)) map.set(row.principalId, { purpose: row.purpose, expiresAt: row.expiresAt });
  }
  return map;
}

// ---------------------------------------------------------------------------
// Sign-in attempts (service connection only)
// ---------------------------------------------------------------------------

export type SignInOutcome = 'success' | 'invalid_credentials' | 'inactive' | 'locked' | 'rate_limited' | 'requested';

export async function insertSignInAttempt(
  db: DbExecutor,
  values: {
    kind: 'sign_in' | 'password_reset_request';
    usernameHash: string;
    ipHash: string | null;
    principalId: string | null;
    outcome: SignInOutcome;
  },
): Promise<void> {
  await db.insert(externalSignInAttempts).values(values);
}

const FAILURE_OUTCOMES: SignInOutcome[] = ['invalid_credentials', 'inactive', 'locked', 'rate_limited'];

export async function countSignInFailures(
  db: DbExecutor,
  input: { usernameHash: string; ipHash: string | null; since: Date },
): Promise<{ usernameFailures: number; ipFailures: number }> {
  const [byUsername] = await db
    .select({ n: count() })
    .from(externalSignInAttempts)
    .where(
      and(
        eq(externalSignInAttempts.kind, 'sign_in'),
        eq(externalSignInAttempts.usernameHash, input.usernameHash),
        gt(externalSignInAttempts.createdAt, input.since),
        inArray(externalSignInAttempts.outcome, FAILURE_OUTCOMES),
      ),
    );
  let ipFailures = 0;
  if (input.ipHash) {
    const [byIp] = await db
      .select({ n: count() })
      .from(externalSignInAttempts)
      .where(
        and(
          eq(externalSignInAttempts.kind, 'sign_in'),
          eq(externalSignInAttempts.ipHash, input.ipHash),
          gt(externalSignInAttempts.createdAt, input.since),
          inArray(externalSignInAttempts.outcome, FAILURE_OUTCOMES),
        ),
      );
    ipFailures = Number(byIp?.n ?? 0);
  }
  return { usernameFailures: Number(byUsername?.n ?? 0), ipFailures };
}

export async function countResetRequests(
  db: DbExecutor,
  input: { usernameHash: string; since: Date },
): Promise<number> {
  const [row] = await db
    .select({ n: count() })
    .from(externalSignInAttempts)
    .where(
      and(
        eq(externalSignInAttempts.kind, 'password_reset_request'),
        eq(externalSignInAttempts.usernameHash, input.usernameHash),
        gt(externalSignInAttempts.createdAt, input.since),
      ),
    );
  return Number(row?.n ?? 0);
}
