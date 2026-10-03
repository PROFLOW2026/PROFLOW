import { todayInTimeZone } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import { EXTERNAL_CAPABILITIES, type ExternalContext } from '@/shared/external';
import { rfiDaysOverdue } from '../domain/lifecycle';
import { countOverdueRfiRows, countRfisByStatus, listRfiRows } from '../data/rfi.repository';
import { scopedVendorIdsAny } from './support';

/**
 * Read models for other tracks:
 *  - Command Center (Track T): overdue RFIs awaiting an answer. The caller passes its own executor
 *    (service role in the consumer worker, or an RLS-bound OrgContext db) and the org-local `today`.
 *  - Contractor portal (Track R): per-principal RFI summary, grant-scoped.
 */

export interface OverdueRfiItem {
  readonly rfiId: string;
  readonly projectId: string;
  readonly number: number;
  readonly subject: string;
  readonly dueDate: string;
  readonly daysOverdue: number;
  readonly vendorId: string | null;
  readonly assigneeUserId: string | null;
  readonly priority: string;
}

export async function listOverdueRfis(
  db: DbExecutor,
  input: {
    organizationId: string;
    today: string;
    projectIds?: readonly string[] | null;
    vendorIds?: readonly string[] | null;
    limit?: number;
  },
): Promise<OverdueRfiItem[]> {
  const rows = await listRfiRows(db, {
    organizationId: input.organizationId,
    projectIds: input.projectIds ?? null,
    vendorIds: input.vendorIds ?? null,
    overdueBefore: input.today,
    limit: Math.min(Math.max(input.limit ?? 50, 1), 200),
  });
  return rows
    .map((row) => ({
      rfiId: row.id,
      projectId: row.projectId,
      number: row.number,
      subject: row.subject,
      dueDate: row.dueDate!,
      daysOverdue: rfiDaysOverdue(row, input.today),
      vendorId: row.vendorId,
      assigneeUserId: row.assigneeUserId,
      priority: row.priority,
    }))
    .sort((a, b) => b.daysOverdue - a.daysOverdue || a.number - b.number);
}

export async function countOverdueRfis(
  db: DbExecutor,
  input: { organizationId: string; today: string; projectIds?: readonly string[] | null },
): Promise<number> {
  return countOverdueRfiRows(db, {
    organizationId: input.organizationId,
    projectIds: input.projectIds ?? null,
    overdueBefore: input.today,
  });
}

export interface ContractorRfiSummary {
  readonly drafts: number;
  readonly awaitingAnswer: number;
  readonly answered: number;
  readonly closed: number;
  readonly overdue: number;
}

const EMPTY_SUMMARY: ContractorRfiSummary = { drafts: 0, awaitingAnswer: 0, answered: 0, closed: 0, overdue: 0 };

/** `projectId` null = every project of the organization the principal's RFI grants cover. */
export async function getContractorRfiSummary(
  context: ExternalContext,
  input: { organizationId: string; projectId?: string | null; today?: string },
): Promise<ContractorRfiSummary> {
  const projectId = input.projectId ?? null;
  const vendorIds = scopedVendorIdsAny(context, input.organizationId, projectId, [
    EXTERNAL_CAPABILITIES.RFI_VIEW,
    EXTERNAL_CAPABILITIES.RFI_RAISE,
  ]);
  if (vendorIds.length === 0) return EMPTY_SUMMARY;
  const today = input.today ?? todayInTimeZone('UTC');
  const filter = { organizationId: input.organizationId, projectId, vendorIds };
  const counts = await countRfisByStatus(context.db, filter);
  const overdue = await countOverdueRfiRows(context.db, { ...filter, overdueBefore: today });
  return {
    drafts: counts.draft,
    awaitingAnswer: counts.submitted + counts.under_review,
    answered: counts.answered,
    closed: counts.closed,
    overdue,
  };
}
