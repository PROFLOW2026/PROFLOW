import { todayInTimeZone } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { EXTERNAL_CAPABILITIES, type ExternalContext } from '@/shared/external';
import { scopedVendorIds } from '@/modules/rfi';
import { submittalDaysOverdue } from '../domain/lifecycle';
import { SUBMITTAL_PENDING_STATUSES } from '../domain/types';
import {
  countOverdueSubmittalRows,
  countSubmittalsByStatus,
  listSubmittalRows,
} from '../data/submittals.repository';

/**
 * Read models for other tracks:
 *  - Command Center (Track T): submittals pending review (oldest first) and overdue reviews. The caller
 *    passes its own executor and the org-local `today`.
 *  - Contractor portal (Track R): grant-scoped submittal summary.
 */

export interface PendingSubmittalItem {
  readonly submittalId: string;
  readonly projectId: string;
  readonly number: number;
  readonly title: string;
  readonly type: string;
  readonly status: string;
  readonly revisionNumber: number;
  readonly dueDate: string | null;
  readonly daysOverdue: number;
  readonly vendorId: string;
  readonly reviewerUserId: string | null;
  readonly submittedAt: Date | null;
}

export async function listPendingSubmittals(
  db: DbExecutor,
  input: {
    organizationId: string;
    today: string;
    projectIds?: readonly string[] | null;
    onlyOverdue?: boolean;
    limit?: number;
  },
): Promise<PendingSubmittalItem[]> {
  const rows = await listSubmittalRows(db, {
    organizationId: input.organizationId,
    projectIds: input.projectIds ?? null,
    statuses: SUBMITTAL_PENDING_STATUSES,
    overdueBefore: input.onlyOverdue ? input.today : null,
    limit: Math.min(Math.max(input.limit ?? 50, 1), 200),
  });
  return rows
    .map((row) => ({
      submittalId: row.id,
      projectId: row.projectId,
      number: row.number,
      title: row.title,
      type: row.type,
      status: row.status,
      revisionNumber: row.currentRevisionNumber,
      dueDate: row.dueDate,
      daysOverdue: submittalDaysOverdue(row, input.today),
      vendorId: row.vendorId,
      reviewerUserId: row.reviewerUserId,
      submittedAt: row.submittedAt,
    }))
    .sort(
      (a, b) =>
        b.daysOverdue - a.daysOverdue ||
        (a.submittedAt?.getTime() ?? 0) - (b.submittedAt?.getTime() ?? 0) ||
        a.number - b.number,
    );
}

export async function countOverdueSubmittals(
  db: DbExecutor,
  input: { organizationId: string; today: string; projectIds?: readonly string[] | null },
): Promise<number> {
  return countOverdueSubmittalRows(db, {
    organizationId: input.organizationId,
    projectIds: input.projectIds ?? null,
    overdueBefore: input.today,
  });
}

export interface ContractorSubmittalSummary {
  readonly drafts: number;
  readonly pendingReview: number;
  /** revise_and_resubmit + rejected: the contractor must act. */
  readonly actionRequired: number;
  readonly approved: number;
  readonly overdueReview: number;
}

const EMPTY: ContractorSubmittalSummary = {
  drafts: 0,
  pendingReview: 0,
  actionRequired: 0,
  approved: 0,
  overdueReview: 0,
};

export async function getContractorSubmittalSummary(
  context: ExternalContext,
  input: { organizationId: string; projectId?: string | null; today?: string },
): Promise<ContractorSubmittalSummary> {
  const projectId = input.projectId ?? null;
  const vendorIds = scopedVendorIds(context, input.organizationId, projectId, EXTERNAL_CAPABILITIES.SUBMITTAL_SUBMIT);
  if (vendorIds.length === 0) return EMPTY;
  const filter = { organizationId: input.organizationId, projectId, vendorIds };
  const counts = await countSubmittalsByStatus(context.db, filter);
  const overdueReview = await countOverdueSubmittalRows(context.db, {
    ...filter,
    overdueBefore: input.today ?? todayInTimeZone('UTC'),
  });
  return {
    drafts: counts.draft,
    pendingReview: counts.submitted + counts.under_review,
    actionRequired: counts.revise_and_resubmit + counts.rejected,
    approved: counts.approved + counts.approved_with_comments,
    overdueReview,
  };
}
