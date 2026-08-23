import { and, desc, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import { apBills, apPoMatches, expenses } from '@drizzle/schema';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
import type { DbExecutor } from '@/shared/db/types';
import { addMoney, money } from '@/shared/money';
import type {
  ApBillOverlapCandidate,
  ExpenseOverlapCandidate,
} from '../domain/expense-ap-overlap';

const OVERLAP_CANDIDATE_LIMIT = 80;

/**
 * Recent finalized expenses for AP create overlap warnings (client filters by vendor/project/amount).
 */
export async function listExpenseOverlapCandidates(
  db: DbExecutor,
  organizationId: string,
): Promise<ExpenseOverlapCandidate[]> {
  const expenseRows = await db
    .select({
      id: expenses.id,
      vendorId: expenses.vendorId,
      projectId: expenses.projectId,
      netAmount: expenses.netAmount,
      currency: expenses.currency,
      description: expenses.description,
    })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        isNotNull(expenses.vendorId),
      ),
    )
    .orderBy(desc(expenses.finalizedAt), desc(expenses.createdAt))
    .limit(OVERLAP_CANDIDATE_LIMIT);

  if (expenseRows.length === 0) return [];

  const expenseIds = expenseRows.map((row) => row.id);
  const matchRows = await db
    .select({
      expenseId: apPoMatches.expenseId,
      matchedAmount: apPoMatches.matchedAmount,
      currency: apPoMatches.currency,
    })
    .from(apPoMatches)
    .innerJoin(apBills, eq(apBills.id, apPoMatches.apBillId))
    .where(
      and(
        eq(apPoMatches.organizationId, organizationId),
        inArray(apPoMatches.expenseId, expenseIds),
        eq(apPoMatches.status, 'accepted'),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
      ),
    );

  const matchedByExpense = new Map<string, string>();
  for (const row of matchRows) {
    if (!row.expenseId) continue;
    const slice = money(row.matchedAmount, row.currency);
    const prev = matchedByExpense.get(row.expenseId);
    matchedByExpense.set(
      row.expenseId,
      prev ? addMoney(money(prev, row.currency), slice).amount : slice.amount,
    );
  }

  return expenseRows.map((row) => ({
    id: row.id,
    vendorId: row.vendorId,
    projectId: row.projectId,
    netAmount: row.netAmount,
    currency: row.currency,
    description: row.description,
    matchedAmount: matchedByExpense.get(row.id) ?? '0',
  }));
}

/** Open / recognized AP bills for expense create overlap warnings. */
export async function listApBillOverlapCandidates(
  db: DbExecutor,
  organizationId: string,
): Promise<ApBillOverlapCandidate[]> {
  const rows = await db
    .select({
      id: apBills.id,
      vendorId: apBills.vendorId,
      projectId: apBills.projectId,
      netAmount: sql<string>`coalesce(${apBills.netAmount}, ${apBills.totalAmount})`,
      currency: apBills.currency,
      reference: apBills.reference,
      status: apBills.status,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
      ),
    )
    .orderBy(desc(apBills.billDate), desc(apBills.createdAt))
    .limit(OVERLAP_CANDIDATE_LIMIT);

  return rows.map((row) => ({
    id: row.id,
    vendorId: row.vendorId,
    projectId: row.projectId,
    netAmount: row.netAmount,
    currency: row.currency,
    reference: row.reference,
    status: row.status,
  }));
}
