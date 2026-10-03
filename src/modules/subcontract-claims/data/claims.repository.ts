import { and, asc, desc, eq, inArray, lt, ne, sql } from 'drizzle-orm';
import {
  profiles,
  subcontractAgreements,
  subcontractClaimAssessments,
  subcontractClaimLineSubmissions,
  subcontractClaimLines,
  subcontractClaimRevisions,
  subcontractClaims,
  vendors,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { AssessmentFact } from '../domain/assessments';
import type { SubcontractClaimStatus } from '../domain/types';

export type ClaimRow = typeof subcontractClaims.$inferSelect;
export type ClaimRevisionRow = typeof subcontractClaimRevisions.$inferSelect;
export type ClaimSubmissionRow = typeof subcontractClaimLineSubmissions.$inferSelect;

export interface ClaimRowWithNames extends ClaimRow {
  readonly vendorName: string | null;
  readonly agreementTitle: string | null;
}

const claimWithNames = {
  claim: subcontractClaims,
  vendorName: vendors.name,
  agreementTitle: subcontractAgreements.title,
};

function joinNames<T extends { claim: ClaimRow; vendorName: string | null; agreementTitle: string | null }>(
  row: T,
): ClaimRowWithNames {
  return { ...row.claim, vendorName: row.vendorName, agreementTitle: row.agreementTitle };
}

export async function findClaim(db: DbExecutor, organizationId: string, claimId: string): Promise<ClaimRowWithNames | null> {
  const [row] = await db
    .select(claimWithNames)
    .from(subcontractClaims)
    .leftJoin(
      vendors,
      and(eq(vendors.id, subcontractClaims.vendorId), eq(vendors.organizationId, subcontractClaims.organizationId)),
    )
    .leftJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, subcontractClaims.agreementId),
        eq(subcontractAgreements.organizationId, subcontractClaims.organizationId),
      ),
    )
    .where(and(eq(subcontractClaims.organizationId, organizationId), eq(subcontractClaims.id, claimId)))
    .limit(1);
  return row ? joinNames(row) : null;
}

export async function lockClaim(db: DbExecutor, organizationId: string, claimId: string): Promise<ClaimRow | null> {
  const [row] = await db
    .select()
    .from(subcontractClaims)
    .where(and(eq(subcontractClaims.organizationId, organizationId), eq(subcontractClaims.id, claimId)))
    .for('update')
    .limit(1);
  return row ?? null;
}

export interface ListClaimsFilter {
  readonly projectId: string;
  readonly vendorIds?: readonly string[];
  readonly statuses?: readonly SubcontractClaimStatus[];
  readonly agreementId?: string | null;
  readonly limit?: number;
}

export async function listClaimRows(
  db: DbExecutor,
  organizationId: string,
  filter: ListClaimsFilter,
): Promise<ClaimRowWithNames[]> {
  const conditions = [
    eq(subcontractClaims.organizationId, organizationId),
    eq(subcontractClaims.projectId, filter.projectId),
  ];
  if (filter.vendorIds) conditions.push(inArray(subcontractClaims.vendorId, [...filter.vendorIds]));
  if (filter.statuses) conditions.push(inArray(subcontractClaims.status, [...filter.statuses]));
  if (filter.agreementId) conditions.push(eq(subcontractClaims.agreementId, filter.agreementId));
  const rows = await db
    .select(claimWithNames)
    .from(subcontractClaims)
    .leftJoin(
      vendors,
      and(eq(vendors.id, subcontractClaims.vendorId), eq(vendors.organizationId, subcontractClaims.organizationId)),
    )
    .leftJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, subcontractClaims.agreementId),
        eq(subcontractAgreements.organizationId, subcontractClaims.organizationId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(subcontractClaims.createdAt))
    .limit(filter.limit ?? 100);
  return rows.map(joinNames);
}

/** Claims awaiting review across the organization (Command Center). Bounded, newest submission first. */
export async function listAwaitingReviewRows(
  db: DbExecutor,
  organizationId: string,
  limit: number,
): Promise<ClaimRowWithNames[]> {
  const rows = await db
    .select(claimWithNames)
    .from(subcontractClaims)
    .leftJoin(
      vendors,
      and(eq(vendors.id, subcontractClaims.vendorId), eq(vendors.organizationId, subcontractClaims.organizationId)),
    )
    .leftJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, subcontractClaims.agreementId),
        eq(subcontractAgreements.organizationId, subcontractClaims.organizationId),
      ),
    )
    .where(
      and(
        eq(subcontractClaims.organizationId, organizationId),
        inArray(subcontractClaims.status, ['submitted', 'under_review']),
      ),
    )
    .orderBy(asc(subcontractClaims.submittedAt))
    .limit(limit);
  return rows.map(joinNames);
}

export async function insertClaim(
  db: DbExecutor,
  values: typeof subcontractClaims.$inferInsert,
): Promise<{ id: string; claimNumber: number }> {
  const [row] = await db
    .insert(subcontractClaims)
    .values(values)
    .returning({ id: subcontractClaims.id, claimNumber: subcontractClaims.claimNumber });
  return row!;
}

export async function updateClaimRow(
  db: DbExecutor,
  organizationId: string,
  claimId: string,
  patch: Partial<typeof subcontractClaims.$inferInsert>,
): Promise<void> {
  await db
    .update(subcontractClaims)
    .set(patch)
    .where(and(eq(subcontractClaims.organizationId, organizationId), eq(subcontractClaims.id, claimId)));
}

// ---------------------------------------------------------------- revisions

export async function insertRevision(
  db: DbExecutor,
  values: typeof subcontractClaimRevisions.$inferInsert,
): Promise<string> {
  const id = values.id ?? crypto.randomUUID();
  await db.insert(subcontractClaimRevisions).values({ ...values, id });
  return id;
}

export async function listRevisions(db: DbExecutor, organizationId: string, claimId: string): Promise<ClaimRevisionRow[]> {
  return db
    .select()
    .from(subcontractClaimRevisions)
    .where(and(eq(subcontractClaimRevisions.organizationId, organizationId), eq(subcontractClaimRevisions.claimId, claimId)))
    .orderBy(asc(subcontractClaimRevisions.revisionNo));
}

export async function updateRevisionRow(
  db: DbExecutor,
  organizationId: string,
  revisionId: string,
  patch: Partial<typeof subcontractClaimRevisions.$inferInsert>,
): Promise<void> {
  await db
    .update(subcontractClaimRevisions)
    .set(patch)
    .where(and(eq(subcontractClaimRevisions.organizationId, organizationId), eq(subcontractClaimRevisions.id, revisionId)));
}

// ---------------------------------------------------------------- lines + submissions

export async function listClaimLines(db: DbExecutor, organizationId: string, claimId: string) {
  return db
    .select({ id: subcontractClaimLines.id, workLineId: subcontractClaimLines.workLineId })
    .from(subcontractClaimLines)
    .where(and(eq(subcontractClaimLines.organizationId, organizationId), eq(subcontractClaimLines.claimId, claimId)));
}

export async function insertClaimLines(
  db: DbExecutor,
  rows: readonly (typeof subcontractClaimLines.$inferInsert)[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(subcontractClaimLines).values([...rows]);
}

export async function listSubmissions(
  db: DbExecutor,
  organizationId: string,
  revisionIds: readonly string[],
): Promise<ClaimSubmissionRow[]> {
  if (revisionIds.length === 0) return [];
  return db
    .select()
    .from(subcontractClaimLineSubmissions)
    .where(
      and(
        eq(subcontractClaimLineSubmissions.organizationId, organizationId),
        inArray(subcontractClaimLineSubmissions.revisionId, [...revisionIds]),
      ),
    );
}

export async function replaceDraftSubmissions(
  db: DbExecutor,
  organizationId: string,
  revisionId: string,
  rows: readonly (typeof subcontractClaimLineSubmissions.$inferInsert)[],
): Promise<void> {
  await db
    .delete(subcontractClaimLineSubmissions)
    .where(
      and(
        eq(subcontractClaimLineSubmissions.organizationId, organizationId),
        eq(subcontractClaimLineSubmissions.revisionId, revisionId),
      ),
    );
  if (rows.length > 0) await db.insert(subcontractClaimLineSubmissions).values([...rows]);
}

/** Current-revision claimed totals per claim (list views, no N+1). */
export async function sumCurrentSubmitted(
  db: DbExecutor,
  organizationId: string,
  claimIds: readonly string[],
): Promise<Map<string, string>> {
  if (claimIds.length === 0) return new Map();
  const rows = await db
    .select({
      claimId: subcontractClaimLineSubmissions.claimId,
      total: sql<string>`coalesce(sum(${subcontractClaimLineSubmissions.currentAmount}), 0)::text`,
    })
    .from(subcontractClaimLineSubmissions)
    .innerJoin(
      subcontractClaimRevisions,
      and(
        eq(subcontractClaimRevisions.id, subcontractClaimLineSubmissions.revisionId),
        eq(subcontractClaimRevisions.organizationId, subcontractClaimLineSubmissions.organizationId),
      ),
    )
    .innerJoin(
      subcontractClaims,
      and(
        eq(subcontractClaims.id, subcontractClaimRevisions.claimId),
        eq(subcontractClaims.organizationId, subcontractClaimRevisions.organizationId),
        eq(subcontractClaims.currentRevisionNo, subcontractClaimRevisions.revisionNo),
      ),
    )
    .where(
      and(
        eq(subcontractClaimLineSubmissions.organizationId, organizationId),
        inArray(subcontractClaimLineSubmissions.claimId, [...claimIds]),
      ),
    )
    .groupBy(subcontractClaimLineSubmissions.claimId);
  return new Map(rows.map((row) => [row.claimId, row.total]));
}

// ---------------------------------------------------------------- assessments

export interface AssessmentRow extends AssessmentFact {
  readonly id: string;
  readonly claimId: string;
  readonly revisionId: string;
  readonly reason: string | null;
  readonly assessorName: string | null;
  readonly createdAt: Date;
}

export async function listAssessments(
  db: DbExecutor,
  organizationId: string,
  claimIds: readonly string[],
): Promise<AssessmentRow[]> {
  if (claimIds.length === 0) return [];
  const rows = await db
    .select({
      id: subcontractClaimAssessments.id,
      seq: subcontractClaimAssessments.seq,
      claimId: subcontractClaimAssessments.claimId,
      revisionId: subcontractClaimAssessments.revisionId,
      claimLineId: subcontractClaimAssessments.claimLineId,
      decision: subcontractClaimAssessments.decision,
      certifiedAmount: subcontractClaimAssessments.certifiedAmount,
      reason: subcontractClaimAssessments.reason,
      assessorName: profiles.displayName,
      createdAt: subcontractClaimAssessments.createdAt,
    })
    .from(subcontractClaimAssessments)
    .leftJoin(profiles, eq(profiles.id, subcontractClaimAssessments.assessorUserId))
    .where(
      and(
        eq(subcontractClaimAssessments.organizationId, organizationId),
        inArray(subcontractClaimAssessments.claimId, [...claimIds]),
      ),
    )
    .orderBy(asc(subcontractClaimAssessments.seq));
  return rows.map((row) => ({ ...row, seq: Number(row.seq) }));
}

export async function insertAssessments(
  db: DbExecutor,
  rows: readonly Omit<typeof subcontractClaimAssessments.$inferInsert, 'seq'>[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(subcontractClaimAssessments).values([...rows]);
}

/**
 * Line decisions of EARLIER certified claims of the agreement, keyed by work line - the input for
 * "prior certified cumulative". Ordered by claim number so a reassessment of an older claim counts.
 */
export async function listPriorCertifiedFacts(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
  beforeClaimNumber: number,
  excludeClaimId: string,
): Promise<(AssessmentFact & { claimId: string; workLineId: string })[]> {
  const rows = await db
    .select({
      seq: subcontractClaimAssessments.seq,
      claimId: subcontractClaimAssessments.claimId,
      claimLineId: subcontractClaimAssessments.claimLineId,
      decision: subcontractClaimAssessments.decision,
      certifiedAmount: subcontractClaimAssessments.certifiedAmount,
      workLineId: subcontractClaimLines.workLineId,
    })
    .from(subcontractClaimAssessments)
    .innerJoin(
      subcontractClaimLines,
      and(
        eq(subcontractClaimLines.id, subcontractClaimAssessments.claimLineId),
        eq(subcontractClaimLines.organizationId, subcontractClaimAssessments.organizationId),
      ),
    )
    .innerJoin(
      subcontractClaims,
      and(
        eq(subcontractClaims.id, subcontractClaimAssessments.claimId),
        eq(subcontractClaims.organizationId, subcontractClaimAssessments.organizationId),
      ),
    )
    .where(
      and(
        eq(subcontractClaims.organizationId, organizationId),
        eq(subcontractClaims.agreementId, agreementId),
        eq(subcontractClaims.status, 'certified'),
        lt(subcontractClaims.claimNumber, beforeClaimNumber),
        ne(subcontractClaims.id, excludeClaimId),
      ),
    );
  return rows.map((row) => ({ ...row, seq: Number(row.seq) }));
}

/** Most recent certified-or-open claim number per agreement for "next claim" guards. */
export async function findOpenClaimForAgreement(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<{ id: string; status: SubcontractClaimStatus } | null> {
  const [row] = await db
    .select({ id: subcontractClaims.id, status: subcontractClaims.status })
    .from(subcontractClaims)
    .where(
      and(
        eq(subcontractClaims.organizationId, organizationId),
        eq(subcontractClaims.agreementId, agreementId),
        inArray(subcontractClaims.status, ['draft', 'submitted', 'under_review', 'returned']),
      ),
    )
    .limit(1);
  return row ?? null;
}
