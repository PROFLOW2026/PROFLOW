import { and, count, desc, eq, inArray, isNotNull, isNull, lt, type SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';
import {
  externalPrincipals,
  profiles,
  projectLocations,
  subcontractAgreements,
  submittalReviews,
  submittalRevisions,
  submittals,
  vendors,
  workPackages,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  SUBMITTAL_PENDING_STATUSES,
  SUBMITTAL_STATUSES,
  type SubmittalDetail,
  type SubmittalListItem,
  type SubmittalReviewDecision,
  type SubmittalRevisionView,
  type SubmittalStatus,
  type SubmittalStatusCounts,
  type SubmittalType,
} from '../domain/types';

/** All queries run on the caller's RLS-bound executor and are always scoped by organization. */

export type SubmittalRow = typeof submittals.$inferSelect;
export type SubmittalRevisionRow = typeof submittalRevisions.$inferSelect;

export async function findSubmittalRow(
  db: DbExecutor,
  organizationId: string,
  submittalId: string,
): Promise<SubmittalRow | null> {
  const [row] = await db
    .select()
    .from(submittals)
    .where(and(eq(submittals.organizationId, organizationId), eq(submittals.id, submittalId)))
    .limit(1);
  return row ?? null;
}

export async function findCurrentRevision(
  db: DbExecutor,
  submittal: Pick<SubmittalRow, 'organizationId' | 'id' | 'currentRevisionNumber'>,
): Promise<SubmittalRevisionRow | null> {
  const [row] = await db
    .select()
    .from(submittalRevisions)
    .where(
      and(
        eq(submittalRevisions.organizationId, submittal.organizationId),
        eq(submittalRevisions.submittalId, submittal.id),
        eq(submittalRevisions.revisionNumber, submittal.currentRevisionNumber),
      ),
    )
    .limit(1);
  return row ?? null;
}

export interface InsertSubmittalValues {
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly type: SubmittalType;
  readonly title: string;
  readonly description: string | null;
  readonly specSection: string | null;
  readonly locationId: string | null;
  readonly drawingId: string | null;
  readonly drawingRevisionId: string | null;
  readonly drawingReference: string | null;
  readonly workPackageId: string | null;
  readonly dueDate: string | null;
  readonly reviewerUserId: string | null;
  readonly createdActorType: 'internal' | 'external';
  readonly createdByUserId: string | null;
  readonly createdByPrincipalId: string | null;
}

export async function insertSubmittal(
  db: DbExecutor,
  values: InsertSubmittalValues,
): Promise<{ id: string; number: number }> {
  const [row] = await db
    .insert(submittals)
    .values({ ...values, status: 'draft', currentRevisionNumber: 1 })
    .returning({ id: submittals.id, number: submittals.number });
  return row!;
}

export type SubmittalPatch = Partial<
  Pick<
    SubmittalRow,
    | 'type'
    | 'title'
    | 'description'
    | 'specSection'
    | 'locationId'
    | 'drawingId'
    | 'drawingRevisionId'
    | 'drawingReference'
    | 'workPackageId'
    | 'dueDate'
    | 'reviewerUserId'
    | 'status'
    | 'currentRevisionNumber'
    | 'submittedAt'
    | 'decidedAt'
  >
>;

/** Optimistic update guarded by status + current revision. null = lost the race. */
export async function updateSubmittalRow(
  db: DbExecutor,
  current: Pick<SubmittalRow, 'organizationId' | 'id' | 'status' | 'currentRevisionNumber'>,
  patch: SubmittalPatch,
): Promise<SubmittalRow | null> {
  const [row] = await db
    .update(submittals)
    .set(patch)
    .where(
      and(
        eq(submittals.organizationId, current.organizationId),
        eq(submittals.id, current.id),
        eq(submittals.status, current.status),
        eq(submittals.currentRevisionNumber, current.currentRevisionNumber),
      ),
    )
    .returning();
  return row ?? null;
}

export async function insertRevision(
  db: DbExecutor,
  values: {
    organizationId: string;
    projectId: string;
    submittalId: string;
    vendorId: string;
    revisionNumber: number;
    notes: string | null;
    createdActorType: 'internal' | 'external';
    createdByUserId: string | null;
    createdByPrincipalId: string | null;
  },
): Promise<string> {
  const [row] = await db.insert(submittalRevisions).values(values).returning({ id: submittalRevisions.id });
  return row!.id;
}

export async function updateDraftRevision(
  db: DbExecutor,
  organizationId: string,
  revisionId: string,
  patch: Partial<
    Pick<
      SubmittalRevisionRow,
      'notes' | 'submittedAt' | 'submittedActorType' | 'submittedByUserId' | 'submittedByPrincipalId'
    >
  >,
): Promise<SubmittalRevisionRow | null> {
  const [row] = await db
    .update(submittalRevisions)
    .set(patch)
    .where(
      and(
        eq(submittalRevisions.organizationId, organizationId),
        eq(submittalRevisions.id, revisionId),
        isNull(submittalRevisions.submittedAt),
      ),
    )
    .returning();
  return row ?? null;
}

export async function insertReview(
  db: DbExecutor,
  values: {
    organizationId: string;
    projectId: string;
    submittalId: string;
    revisionId: string;
    decision: SubmittalReviewDecision;
    comments: string | null;
    reviewerUserId: string;
  },
): Promise<string> {
  const [row] = await db.insert(submittalReviews).values(values).returning({ id: submittalReviews.id });
  return row!.id;
}

export interface SubmittalListFilter {
  readonly organizationId: string;
  readonly projectId?: string | null;
  readonly projectIds?: readonly string[] | null;
  readonly statuses?: readonly SubmittalStatus[] | null;
  readonly type?: SubmittalType | null;
  readonly vendorIds?: readonly string[] | null;
  readonly overdueBefore?: string | null;
  readonly limit: number;
  readonly offset?: number;
}

function listConditions(filter: SubmittalListFilter): SQL[] {
  const conditions: SQL[] = [eq(submittals.organizationId, filter.organizationId), isNull(submittals.archivedAt)];
  if (filter.projectId) conditions.push(eq(submittals.projectId, filter.projectId));
  if (filter.projectIds) conditions.push(inArray(submittals.projectId, [...filter.projectIds]));
  if (filter.statuses && filter.statuses.length > 0) {
    conditions.push(inArray(submittals.status, [...filter.statuses]));
  }
  if (filter.type) conditions.push(eq(submittals.type, filter.type));
  if (filter.vendorIds) conditions.push(inArray(submittals.vendorId, [...filter.vendorIds]));
  if (filter.overdueBefore) {
    conditions.push(inArray(submittals.status, [...SUBMITTAL_PENDING_STATUSES]));
    conditions.push(isNotNull(submittals.dueDate));
    conditions.push(lt(submittals.dueDate, filter.overdueBefore));
  }
  return conditions;
}

function emptyScope(filter: { vendorIds?: readonly string[] | null; projectIds?: readonly string[] | null }) {
  return (filter.vendorIds && filter.vendorIds.length === 0) || (filter.projectIds && filter.projectIds.length === 0);
}

const reviewer = alias(profiles, 'submittal_reviewer');

export async function listSubmittalRows(db: DbExecutor, filter: SubmittalListFilter): Promise<SubmittalListItem[]> {
  if (emptyScope(filter)) return [];
  return db
    .select({
      id: submittals.id,
      projectId: submittals.projectId,
      number: submittals.number,
      title: submittals.title,
      type: submittals.type,
      status: submittals.status,
      currentRevisionNumber: submittals.currentRevisionNumber,
      dueDate: submittals.dueDate,
      vendorId: submittals.vendorId,
      subcontractAgreementId: submittals.subcontractAgreementId,
      vendorName: vendors.name,
      locationName: projectLocations.name,
      specSection: submittals.specSection,
      reviewerUserId: submittals.reviewerUserId,
      reviewerName: reviewer.displayName,
      submittedAt: submittals.submittedAt,
      decidedAt: submittals.decidedAt,
      createdAt: submittals.createdAt,
    })
    .from(submittals)
    .leftJoin(vendors, and(eq(vendors.id, submittals.vendorId), eq(vendors.organizationId, submittals.organizationId)))
    .leftJoin(
      projectLocations,
      and(
        eq(projectLocations.id, submittals.locationId),
        eq(projectLocations.organizationId, submittals.organizationId),
      ),
    )
    .leftJoin(reviewer, eq(reviewer.id, submittals.reviewerUserId))
    .where(and(...listConditions(filter)))
    .orderBy(desc(submittals.number))
    .limit(filter.limit)
    .offset(filter.offset ?? 0);
}

export async function countSubmittalsByStatus(
  db: DbExecutor,
  filter: Omit<SubmittalListFilter, 'limit' | 'offset' | 'statuses' | 'overdueBefore'>,
): Promise<SubmittalStatusCounts> {
  const counts = Object.fromEntries(SUBMITTAL_STATUSES.map((status) => [status, 0])) as Record<
    SubmittalStatus,
    number
  >;
  if (emptyScope(filter)) return counts;
  const rows = await db
    .select({ status: submittals.status, total: count() })
    .from(submittals)
    .where(and(...listConditions({ ...filter, limit: 0 })))
    .groupBy(submittals.status);
  for (const row of rows) counts[row.status] = Number(row.total);
  return counts;
}

export async function countOverdueSubmittalRows(
  db: DbExecutor,
  filter: Omit<SubmittalListFilter, 'limit' | 'offset' | 'statuses'> & { overdueBefore: string },
): Promise<number> {
  if (emptyScope(filter)) return 0;
  const [row] = await db
    .select({ total: count() })
    .from(submittals)
    .where(and(...listConditions({ ...filter, limit: 0 })));
  return Number(row?.total ?? 0);
}

const submitter = alias(profiles, 'submittal_submitter');
const submitterPrincipal = alias(externalPrincipals, 'submittal_submitter_principal');

export async function loadSubmittalDetail(
  db: DbExecutor,
  organizationId: string,
  submittalId: string,
  options: { includeInternalNames: boolean },
): Promise<SubmittalDetail | null> {
  const [row] = await db
    .select({
      submittal: submittals,
      vendorName: vendors.name,
      agreementTitle: subcontractAgreements.title,
      locationName: projectLocations.name,
      workPackageName: workPackages.name,
      reviewerName: reviewer.displayName,
    })
    .from(submittals)
    .leftJoin(vendors, and(eq(vendors.id, submittals.vendorId), eq(vendors.organizationId, submittals.organizationId)))
    .leftJoin(
      subcontractAgreements,
      and(
        eq(subcontractAgreements.id, submittals.subcontractAgreementId),
        eq(subcontractAgreements.organizationId, submittals.organizationId),
      ),
    )
    .leftJoin(
      projectLocations,
      and(
        eq(projectLocations.id, submittals.locationId),
        eq(projectLocations.organizationId, submittals.organizationId),
      ),
    )
    .leftJoin(
      workPackages,
      and(eq(workPackages.id, submittals.workPackageId), eq(workPackages.organizationId, submittals.organizationId)),
    )
    .leftJoin(reviewer, eq(reviewer.id, submittals.reviewerUserId))
    .where(and(eq(submittals.organizationId, organizationId), eq(submittals.id, submittalId)))
    .limit(1);
  if (!row) return null;

  const revisionRows = await db
    .select({
      id: submittalRevisions.id,
      revisionNumber: submittalRevisions.revisionNumber,
      notes: submittalRevisions.notes,
      submittedAt: submittalRevisions.submittedAt,
      submittedActorType: submittalRevisions.submittedActorType,
      submittedByName: submitter.displayName,
      submittedByPrincipalName: submitterPrincipal.displayName,
      createdAt: submittalRevisions.createdAt,
    })
    .from(submittalRevisions)
    .leftJoin(submitter, eq(submitter.id, submittalRevisions.submittedByUserId))
    .leftJoin(submitterPrincipal, eq(submitterPrincipal.id, submittalRevisions.submittedByPrincipalId))
    .where(and(eq(submittalRevisions.organizationId, organizationId), eq(submittalRevisions.submittalId, submittalId)))
    .orderBy(desc(submittalRevisions.revisionNumber))
    .limit(100);

  const reviewRows = await db
    .select({
      id: submittalReviews.id,
      revisionId: submittalReviews.revisionId,
      decision: submittalReviews.decision,
      comments: submittalReviews.comments,
      reviewerName: reviewer.displayName,
      createdAt: submittalReviews.createdAt,
    })
    .from(submittalReviews)
    .leftJoin(reviewer, eq(reviewer.id, submittalReviews.reviewerUserId))
    .where(and(eq(submittalReviews.organizationId, organizationId), eq(submittalReviews.submittalId, submittalId)))
    .limit(100);

  const internalNames = options.includeInternalNames;
  const reviewsByRevision = new Map(
    reviewRows.map((review) => [
      review.revisionId,
      { ...review, reviewerName: internalNames ? review.reviewerName : null },
    ]),
  );
  const revisions: SubmittalRevisionView[] = revisionRows.map((revision) => ({
    id: revision.id,
    revisionNumber: revision.revisionNumber,
    notes: revision.notes,
    submittedAt: revision.submittedAt,
    submittedByName:
      revision.submittedActorType === 'external'
        ? revision.submittedByPrincipalName
        : internalNames
          ? revision.submittedByName
          : null,
    createdAt: revision.createdAt,
    review: reviewsByRevision.get(revision.id) ?? null,
  }));

  const s = row.submittal;
  return {
    id: s.id,
    organizationId: s.organizationId,
    projectId: s.projectId,
    number: s.number,
    title: s.title,
    type: s.type,
    status: s.status,
    currentRevisionNumber: s.currentRevisionNumber,
    dueDate: s.dueDate,
    vendorId: s.vendorId,
    vendorName: row.vendorName,
    subcontractAgreementId: s.subcontractAgreementId,
    agreementTitle: row.agreementTitle,
    description: s.description,
    specSection: s.specSection,
    locationId: s.locationId,
    locationName: row.locationName,
    drawingId: s.drawingId,
    drawingRevisionId: s.drawingRevisionId,
    drawingReference: s.drawingReference,
    workPackageId: s.workPackageId,
    workPackageName: row.workPackageName,
    reviewerUserId: internalNames ? s.reviewerUserId : null,
    reviewerName: internalNames ? row.reviewerName : null,
    createdActorType: s.createdActorType,
    submittedAt: s.submittedAt,
    decidedAt: s.decidedAt,
    createdAt: s.createdAt,
    revisions,
  };
}
