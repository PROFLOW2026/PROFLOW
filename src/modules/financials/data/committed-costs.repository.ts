import { and, eq, inArray, isNotNull, isNull } from 'drizzle-orm';
import { apBills, apPoMatches, committedCosts, expenses } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  money,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import {
  computeBillOutstanding,
  getVendorPaymentsRepository,
  RECOGNIZED_VENDOR_BILL_STATUSES,
} from '@/modules/ap';

const OPEN_COMMITTED_STATUSES = ['open', 'partially_consumed'] as const;
/** Recognized bills may still owe cash after PO match — include `matched`. */
const OPEN_AP_CASH_STATUSES = RECOGNIZED_VENDOR_BILL_STATUSES;

/**
 * Sum open committed costs for a project in a single currency.
 * Foreign-currency rows are excluded (count returned for coverage disclosure).
 * Committed amounts are never treated as Expense / Actual cost.
 */
export async function sumOpenCommittedCostsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<{ total: MoneyValue; excludedForeignCurrencyCount: number }> {
  const normalized = currency.toUpperCase();
  const rows = await db
    .select({
      amount: committedCosts.amount,
      currency: committedCosts.currency,
    })
    .from(committedCosts)
    .where(
      and(
        eq(committedCosts.organizationId, organizationId),
        eq(committedCosts.projectId, projectId),
        inArray(committedCosts.status, [...OPEN_COMMITTED_STATUSES]),
      ),
    );

  let total = zeroMoney(normalized);
  let excludedForeignCurrencyCount = 0;
  for (const row of rows) {
    if (row.currency.toUpperCase() !== normalized) {
      excludedForeignCurrencyCount += 1;
      continue;
    }
    const amount = fromNumericString(row.amount, row.currency);
    if (!amount) continue;
    total = addMoney(total, amount);
  }

  return { total: roundMoney(total), excludedForeignCurrencyCount };
}

/**
 * Sum cash outstanding on recognized AP bills for a project.
 * Outstanding = bill total − active (non-void) vendor payment applications.
 * Not Actual cost (recognized bill totals enter Actual separately; payments ignored there).
 * PO match remainder is a separate matching metric — never used as open AP cash.
 */
export async function sumOpenApPayableForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<{ total: MoneyValue; excludedForeignCurrencyCount: number; billCount: number }> {
  const normalized = currency.toUpperCase();
  const rows = await db
    .select({
      id: apBills.id,
      status: apBills.status,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        eq(apBills.projectId, projectId),
        inArray(apBills.status, [...OPEN_AP_CASH_STATUSES]),
        isNull(apBills.archivedAt),
      ),
    );

  const appliedByBillId = await getVendorPaymentsRepository().listActiveAppliedAmountsForBills(
    db,
    organizationId,
    rows.map((row) => row.id),
  );

  let total = zeroMoney(normalized);
  let excludedForeignCurrencyCount = 0;
  let billCount = 0;
  for (const row of rows) {
    if (row.currency.toUpperCase() !== normalized) {
      excludedForeignCurrencyCount += 1;
      continue;
    }
    const outstanding = computeBillOutstanding({
      billStatus: row.status,
      billTotal: money(row.totalAmount, row.currency),
      applications: (appliedByBillId.get(row.id) ?? []).map((amount) => ({
        appliedAmount: money(amount, row.currency),
        paymentStatus: 'recorded' as const,
      })),
    });
    if (!isPositiveMoney(outstanding)) continue;
    total = addMoney(total, outstanding);
    billCount += 1;
  }

  return { total: roundMoney(total), excludedForeignCurrencyCount, billCount };
}

export interface RecognizedVendorBillRollup {
  readonly billAmounts: string[];
  readonly total: MoneyValue;
  readonly linkedExpenseIds: ReadonlySet<string>;
  readonly excludedForeignCurrencyCount: number;
  readonly billCount: number;
}

/**
 * Posted/approved vendor bills for a project — recognized Actual Vendor Cost.
 * Also returns expense ids linked via accepted matches (exclude to avoid double-count).
 */
export async function loadRecognizedVendorBillsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<RecognizedVendorBillRollup> {
  const normalized = currency.toUpperCase();
  const billRows = await db
    .select({
      id: apBills.id,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        eq(apBills.projectId, projectId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
      ),
    );

  const billAmounts: string[] = [];
  let total = zeroMoney(normalized);
  let excludedForeignCurrencyCount = 0;
  const recognizedBillIds: string[] = [];

  for (const row of billRows) {
    if (row.currency.toUpperCase() !== normalized) {
      excludedForeignCurrencyCount += 1;
      continue;
    }
    const amount = fromNumericString(row.totalAmount, row.currency);
    if (!amount) continue;
    billAmounts.push(row.totalAmount);
    total = addMoney(total, amount);
    recognizedBillIds.push(row.id);
  }

  const linkedExpenseIds = new Set<string>();
  if (recognizedBillIds.length > 0) {
    const linkedRows = await db
      .select({
        expenseId: apPoMatches.expenseId,
        expenseCurrency: expenses.currency,
        expenseStatus: expenses.status,
      })
      .from(apPoMatches)
      .innerJoin(expenses, eq(expenses.id, apPoMatches.expenseId))
      .where(
        and(
          eq(apPoMatches.organizationId, organizationId),
          inArray(apPoMatches.apBillId, recognizedBillIds),
          eq(apPoMatches.status, 'accepted'),
          isNotNull(apPoMatches.expenseId),
          eq(expenses.status, 'finalized'),
          isNull(expenses.archivedAt),
        ),
      );

    for (const row of linkedRows) {
      if (!row.expenseId) continue;
      // Only dedupe same-currency finalized expenses (FX excluded like other rollups).
      if (row.expenseCurrency.toUpperCase() !== normalized) continue;
      linkedExpenseIds.add(row.expenseId);
    }
  }

  return {
    billAmounts,
    total: roundMoney(total),
    linkedExpenseIds,
    excludedForeignCurrencyCount,
    billCount: billAmounts.length,
  };
}

export type ProjectMoneyRollup = {
  readonly total: MoneyValue;
  readonly excludedForeignCurrencyCount: number;
};

export type ProjectApPayableRollup = ProjectMoneyRollup & {
  readonly billCount: number;
};

/**
 * Open committed costs for many projects — one query, grouped in memory.
 */
export async function sumOpenCommittedCostsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
): Promise<Map<string, ProjectMoneyRollup>> {
  const result = new Map<string, ProjectMoneyRollup>();
  if (projectIds.length === 0) return result;

  const normalized = currency.toUpperCase();
  const rows = await db
    .select({
      projectId: committedCosts.projectId,
      amount: committedCosts.amount,
      currency: committedCosts.currency,
    })
    .from(committedCosts)
    .where(
      and(
        eq(committedCosts.organizationId, organizationId),
        inArray(committedCosts.projectId, [...projectIds]),
        inArray(committedCosts.status, [...OPEN_COMMITTED_STATUSES]),
      ),
    );

  const totals = new Map<string, { total: MoneyValue; excluded: number }>();
  for (const row of rows) {
    if (!row.projectId) continue;
    const bucket = totals.get(row.projectId) ?? {
      total: zeroMoney(normalized),
      excluded: 0,
    };
    if (row.currency.toUpperCase() !== normalized) {
      bucket.excluded += 1;
      totals.set(row.projectId, bucket);
      continue;
    }
    const amount = fromNumericString(row.amount, row.currency);
    if (amount) bucket.total = addMoney(bucket.total, amount);
    totals.set(row.projectId, bucket);
  }

  for (const [projectId, bucket] of totals) {
    result.set(projectId, {
      total: roundMoney(bucket.total),
      excludedForeignCurrencyCount: bucket.excluded,
    });
  }
  return result;
}

/**
 * Open AP cash payable for many projects — bills + one active-payment-applications query.
 */
export async function sumOpenApPayableForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
): Promise<Map<string, ProjectApPayableRollup>> {
  const result = new Map<string, ProjectApPayableRollup>();
  if (projectIds.length === 0) return result;

  const normalized = currency.toUpperCase();
  const rows = await db
    .select({
      id: apBills.id,
      projectId: apBills.projectId,
      status: apBills.status,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.projectId, [...projectIds]),
        inArray(apBills.status, [...OPEN_AP_CASH_STATUSES]),
        isNull(apBills.archivedAt),
      ),
    );

  const appliedByBillId = await getVendorPaymentsRepository().listActiveAppliedAmountsForBills(
    db,
    organizationId,
    rows.map((row) => row.id),
  );

  const buckets = new Map<
    string,
    { total: MoneyValue; excluded: number; billCount: number }
  >();
  for (const row of rows) {
    if (!row.projectId) continue;
    const bucket = buckets.get(row.projectId) ?? {
      total: zeroMoney(normalized),
      excluded: 0,
      billCount: 0,
    };
    if (row.currency.toUpperCase() !== normalized) {
      bucket.excluded += 1;
      buckets.set(row.projectId, bucket);
      continue;
    }
    const outstanding = computeBillOutstanding({
      billStatus: row.status,
      billTotal: money(row.totalAmount, row.currency),
      applications: (appliedByBillId.get(row.id) ?? []).map((amount) => ({
        appliedAmount: money(amount, row.currency),
        paymentStatus: 'recorded' as const,
      })),
    });
    if (!isPositiveMoney(outstanding)) {
      buckets.set(row.projectId, bucket);
      continue;
    }
    bucket.total = addMoney(bucket.total, outstanding);
    bucket.billCount += 1;
    buckets.set(row.projectId, bucket);
  }

  for (const [projectId, bucket] of buckets) {
    result.set(projectId, {
      total: roundMoney(bucket.total),
      excludedForeignCurrencyCount: bucket.excluded,
      billCount: bucket.billCount,
    });
  }
  return result;
}

/**
 * Recognized vendor bills for many projects — bills + linked expenses in two queries.
 */
export async function loadRecognizedVendorBillsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
): Promise<Map<string, RecognizedVendorBillRollup>> {
  const result = new Map<string, RecognizedVendorBillRollup>();
  if (projectIds.length === 0) return result;

  const normalized = currency.toUpperCase();
  const billRows = await db
    .select({
      id: apBills.id,
      projectId: apBills.projectId,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.projectId, [...projectIds]),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
      ),
    );

  const billAmountsByProject = new Map<
    string,
    { billAmounts: string[]; total: MoneyValue; excluded: number; recognizedBillIds: string[] }
  >();

  for (const row of billRows) {
    if (!row.projectId) continue;
    const bucket = billAmountsByProject.get(row.projectId) ?? {
      billAmounts: [],
      total: zeroMoney(normalized),
      excluded: 0,
      recognizedBillIds: [],
    };
    if (row.currency.toUpperCase() !== normalized) {
      bucket.excluded += 1;
      billAmountsByProject.set(row.projectId, bucket);
      continue;
    }
    const amount = fromNumericString(row.totalAmount, row.currency);
    if (!amount) {
      billAmountsByProject.set(row.projectId, bucket);
      continue;
    }
    bucket.billAmounts.push(row.totalAmount);
    bucket.total = addMoney(bucket.total, amount);
    bucket.recognizedBillIds.push(row.id);
    billAmountsByProject.set(row.projectId, bucket);
  }

  const allRecognizedIds = [...billAmountsByProject.values()].flatMap(
    (bucket) => bucket.recognizedBillIds,
  );

  const linkedByBill = new Map<string, string[]>();
  if (allRecognizedIds.length > 0) {
    const linkedRows = await db
      .select({
        apBillId: apPoMatches.apBillId,
        expenseId: apPoMatches.expenseId,
        expenseCurrency: expenses.currency,
      })
      .from(apPoMatches)
      .innerJoin(expenses, eq(expenses.id, apPoMatches.expenseId))
      .where(
        and(
          eq(apPoMatches.organizationId, organizationId),
          inArray(apPoMatches.apBillId, allRecognizedIds),
          eq(apPoMatches.status, 'accepted'),
          isNotNull(apPoMatches.expenseId),
          eq(expenses.status, 'finalized'),
          isNull(expenses.archivedAt),
        ),
      );

    for (const row of linkedRows) {
      if (!row.expenseId) continue;
      if (row.expenseCurrency.toUpperCase() !== normalized) continue;
      const list = linkedByBill.get(row.apBillId) ?? [];
      list.push(row.expenseId);
      linkedByBill.set(row.apBillId, list);
    }
  }

  for (const [projectId, bucket] of billAmountsByProject) {
    const linkedExpenseIds = new Set<string>();
    for (const billId of bucket.recognizedBillIds) {
      for (const expenseId of linkedByBill.get(billId) ?? []) {
        linkedExpenseIds.add(expenseId);
      }
    }
    result.set(projectId, {
      billAmounts: bucket.billAmounts,
      total: roundMoney(bucket.total),
      linkedExpenseIds,
      excludedForeignCurrencyCount: bucket.excluded,
      billCount: bucket.billAmounts.length,
    });
  }

  return result;
}
