/**
 * Submittal vocabulary (pure, client-safe). Mirrors migration 0163 / `drizzle/schema/dg-rfi-submittals.ts`.
 */

export const SUBMITTAL_TYPES = [
  'product',
  'equipment',
  'sample',
  'technical_data',
  'catalogue',
  'shop_drawing',
  'material',
] as const;
export type SubmittalType = (typeof SUBMITTAL_TYPES)[number];

export const SUBMITTAL_STATUSES = [
  'draft',
  'submitted',
  'under_review',
  'approved',
  'approved_with_comments',
  'revise_and_resubmit',
  'rejected',
  'withdrawn',
] as const;
export type SubmittalStatus = (typeof SUBMITTAL_STATUSES)[number];

export const SUBMITTAL_REVIEW_DECISIONS = [
  'approved',
  'approved_with_comments',
  'revise_and_resubmit',
  'rejected',
] as const;
export type SubmittalReviewDecision = (typeof SUBMITTAL_REVIEW_DECISIONS)[number];

export const SUBMITTAL_ACTIONS = ['submit', 'start_review', 'review', 'open_revision', 'withdraw'] as const;
export type SubmittalAction = (typeof SUBMITTAL_ACTIONS)[number];

export type SubmittalActorType = 'internal' | 'external';

/** Waiting on the project team's review. */
export const SUBMITTAL_PENDING_STATUSES: readonly SubmittalStatus[] = ['submitted', 'under_review'];

/** Waiting on the contractor (prepare / resubmit). */
export const SUBMITTAL_CONTRACTOR_ACTION_STATUSES: readonly SubmittalStatus[] = [
  'draft',
  'revise_and_resubmit',
  'rejected',
];

export interface SubmittalListItem {
  readonly id: string;
  readonly projectId: string;
  readonly number: number;
  readonly title: string;
  readonly type: SubmittalType;
  readonly status: SubmittalStatus;
  readonly currentRevisionNumber: number;
  readonly dueDate: string | null;
  readonly vendorId: string;
  readonly subcontractAgreementId: string | null;
  readonly vendorName: string | null;
  readonly locationName: string | null;
  readonly specSection: string | null;
  readonly reviewerUserId: string | null;
  readonly reviewerName: string | null;
  readonly submittedAt: Date | null;
  readonly decidedAt: Date | null;
  readonly createdAt: Date;
}

export interface SubmittalReviewView {
  readonly id: string;
  readonly revisionId: string;
  readonly decision: SubmittalReviewDecision;
  readonly comments: string | null;
  readonly reviewerName: string | null;
  readonly createdAt: Date;
}

export interface SubmittalRevisionView {
  readonly id: string;
  readonly revisionNumber: number;
  readonly notes: string | null;
  readonly submittedAt: Date | null;
  readonly submittedByName: string | null;
  readonly createdAt: Date;
  readonly review: SubmittalReviewView | null;
}

export interface SubmittalDetail extends SubmittalListItem {
  readonly organizationId: string;
  readonly subcontractAgreementId: string | null;
  readonly agreementTitle: string | null;
  readonly description: string | null;
  readonly locationId: string | null;
  readonly drawingId: string | null;
  readonly drawingRevisionId: string | null;
  readonly drawingReference: string | null;
  readonly workPackageId: string | null;
  readonly workPackageName: string | null;
  readonly createdActorType: SubmittalActorType;
  /** Newest first. */
  readonly revisions: readonly SubmittalRevisionView[];
}

export type SubmittalStatusCounts = Readonly<Record<SubmittalStatus, number>>;
