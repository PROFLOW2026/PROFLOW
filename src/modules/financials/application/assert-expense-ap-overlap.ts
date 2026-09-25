import type { DbExecutor } from '@/shared/db/types';
import {
  assertNoUnlinkedExpenseApOverlap,
  findSimilarFinalizedExpensesForBill,
  findSimilarOpenApBillsForExpense,
} from '../domain/expense-ap-overlap';
import {
  listAcceptedMatchedBillIdsForExpense,
  listApBillOverlapCandidatesForVendor,
  listExpenseOverlapCandidatesForVendor,
} from '../data/expense-ap-overlap.repository';

/**
 * Block expense finalize when an unlinked recognized bill would double-count.
 * Accepted ap_po_matches are the dedup source of truth and are dropped first.
 */
export async function assertExpenseFinalizeHasNoUnlinkedApOverlap(
  db: DbExecutor,
  organizationId: string,
  expense: {
    readonly id: string;
    readonly vendorId: string | null;
    readonly projectId: string | null;
    readonly netAmount: string;
    readonly currency: string;
  },
  confirmDistinctCosts = false,
): Promise<void> {
  if (confirmDistinctCosts || !expense.vendorId) return;

  const [candidates, linkedBillIds] = await Promise.all([
    listApBillOverlapCandidatesForVendor(db, organizationId, expense.vendorId),
    listAcceptedMatchedBillIdsForExpense(db, organizationId, expense.id),
  ]);
  const linked = new Set(linkedBillIds);
  const hits = findSimilarOpenApBillsForExpense(
    {
      vendorId: expense.vendorId,
      projectId: expense.projectId,
      netAmount: expense.netAmount,
      currency: expense.currency,
    },
    candidates.filter((candidate) => !linked.has(candidate.id)),
  );
  assertNoUnlinkedExpenseApOverlap({
    hitCount: hits.length,
    confirmDistinctCosts,
    messageKey: 'expenses.errors.unlinkedApOverlap',
  });
}

/**
 * Block AP recognition when an unlinked finalized expense would double-count.
 * Expenses already accepted against this bill are dropped.
 */
export async function assertApBillHasNoUnlinkedExpenseOverlap(
  db: DbExecutor,
  organizationId: string,
  bill: {
    readonly id: string;
    readonly vendorId: string;
    readonly projectId: string | null;
    readonly netAmount: string | null;
    readonly totalAmount: string;
    readonly currency: string;
  },
  confirmDistinctCosts = false,
): Promise<void> {
  if (confirmDistinctCosts) return;

  const candidates = await listExpenseOverlapCandidatesForVendor(
    db,
    organizationId,
    bill.vendorId,
  );
  const unlinked = candidates.filter(
    (candidate) => !(candidate.acceptedBillIds ?? []).includes(bill.id),
  );
  const hits = findSimilarFinalizedExpensesForBill(
    {
      vendorId: bill.vendorId,
      projectId: bill.projectId,
      totalAmount: bill.netAmount ?? bill.totalAmount,
      currency: bill.currency,
    },
    unlinked,
  );
  assertNoUnlinkedExpenseApOverlap({
    hitCount: hits.length,
    confirmDistinctCosts,
    messageKey: 'ap.errors.unlinkedExpenseOverlap',
  });
}
