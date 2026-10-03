/**
 * RFI vocabulary (pure, client-safe). Mirrors the CHECK constraints in migration 0163 /
 * `drizzle/schema/dg-rfi-submittals.ts` (kept in sync by tests/unit/rfi-submittals).
 */

export const RFI_STATUSES = ['draft', 'submitted', 'under_review', 'answered', 'closed'] as const;
export type RfiStatus = (typeof RFI_STATUSES)[number];

export const RFI_PRIORITIES = ['low', 'normal', 'high', 'urgent'] as const;
export type RfiPriority = (typeof RFI_PRIORITIES)[number];

export const RFI_ACTIONS = ['submit', 'start_review', 'answer', 'close', 'reopen'] as const;
export type RfiAction = (typeof RFI_ACTIONS)[number];

/** Waiting for the project team to answer. */
export const RFI_AWAITING_ANSWER_STATUSES: readonly RfiStatus[] = ['submitted', 'under_review'];

export type RfiActorType = 'internal' | 'external';

export interface RfiListItem {
  readonly id: string;
  readonly projectId: string;
  readonly number: number;
  readonly subject: string;
  readonly status: RfiStatus;
  readonly priority: RfiPriority;
  readonly dueDate: string | null;
  readonly vendorId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly vendorName: string | null;
  readonly locationId: string | null;
  readonly locationName: string | null;
  readonly assigneeUserId: string | null;
  readonly assigneeName: string | null;
  readonly raisedActorType: RfiActorType;
  readonly submittedAt: Date | null;
  readonly answeredAt: Date | null;
  readonly createdAt: Date;
}

export interface RfiAnswerView {
  readonly id: string;
  readonly body: string;
  readonly answeredByName: string | null;
  readonly supersedesAnswerId: string | null;
  readonly createdAt: Date;
}

export interface RfiHistoryEntry {
  readonly id: string;
  readonly fromStatus: RfiStatus | null;
  readonly toStatus: RfiStatus;
  readonly reason: string | null;
  readonly actorType: 'internal' | 'external' | 'system';
  readonly actorName: string | null;
  readonly createdAt: Date;
}

export interface RfiDetail extends RfiListItem {
  readonly organizationId: string;
  readonly subcontractAgreementId: string | null;
  readonly agreementTitle: string | null;
  readonly question: string;
  readonly drawingId: string | null;
  readonly drawingRevisionId: string | null;
  readonly drawingReference: string | null;
  readonly workPackageId: string | null;
  readonly workPackageName: string | null;
  readonly raisedByName: string | null;
  readonly closedAt: Date | null;
  readonly reopenCount: number;
  readonly answers: readonly RfiAnswerView[];
  readonly history: readonly RfiHistoryEntry[];
}

export interface RfiStatusCounts {
  readonly draft: number;
  readonly submitted: number;
  readonly under_review: number;
  readonly answered: number;
  readonly closed: number;
}
