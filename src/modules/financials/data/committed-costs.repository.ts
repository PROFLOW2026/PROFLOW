import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import { apBillProjectAllocations, apBills, apPoMatches, committedCosts, expenses } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { buildLinkedExpenseDeductions } from '../domain/expense-ap-dedup';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  money,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import {
  areApBillProjectAllocationsAvailable,
  computeBillOutstanding,
  getVendorPaymentsRepository,
  listActiveCreditAmountsForBills,
  resolveVendorBillProjectAmounts,
  scaleBillOutstandingToProjectSlice,
  scaleBillSliceAfterCredits,
  netProjectSliceAfterCredits,
  listActiveCreditActualReductionsForBills,
} from '@/modules/ap';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
const OPEN_COMMITTED_STATUSES = ['open', 'partially_consumed'] as const;
/** Recognized bills may still owe cash after PO match - include `matched`. */
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
 * Honors `ap_bill_project_allocations` when the 0021 gate is on (R-020).
 * Not Actual cost (recognized bill totals enter Actual separately; payments ignored there).
 * PO match remainder is a separate matching metric - never used as open AP cash.
 */
export async function sumOpenApPayableForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<{ total: MoneyValue; excludedForeignCurrencyCount: number; billCount: number }> {
  const normalized = currency.toUpperCase();

  if (!areApBillProjectAllocationsAvailable()) {
    return sumOpenApPayableForProjectHeaderOnly(db, organizationId, projectId, normalized);
  }

  const billRows = await db
    .select({
      id: apBills.id,
      projectId: apBills.projectId,
      status: apBills.status,
      totalAmount: apBills.totalAmount,
      netAmount: apBills.netAmount,
      currency: apBills.currency,
      retentionHeldRemaining: apBills.retentionHeldRemaining,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.status, [...OPEN_AP_CASH_STATUSES]),
        isNull(apBills.archivedAt),
        sql`(
          ${apBills.projectId} = ${projectId}
          OR EXISTS (
            SELECT 1 FROM ${apBillProjectAllocations} a
            WHERE a.ap_bill_id = ${apBills.id}
              AND a.organization_id = ${organizationId}
              AND a.target_type = 'project'
              AND a.project_id = ${projectId}
              AND a.status = 'applied'
          )
        )`,
      ),
    );

  const allocationLines: { billId: string; projectId: string; amount: string; currency: string }[] =
    [];
  const billIdsWithAllocations = new Set<string>();

  if (billRows.length > 0) {
    const allIds = billRows.map((row) => row.id);
    const anyAlloc = await db
      .select({
        apBillId: apBillProjectAllocations.apBillId,
        projectId: apBillProjectAllocations.projectId,
        amount: apBillProjectAllocations.amount,
        currency: apBillProjectAllocations.currency,
        targetType: apBillProjectAllocations.targetType,
        status: apBillProjectAllocations.status,
      })
      .from(apBillProjectAllocations)
      .where(
        and(
          eq(apBillProjectAllocations.organizationId, organizationId),
          inArray(apBillProjectAllocations.apBillId, allIds),
          eq(apBillProjectAllocations.status, 'applied'),
        ),
      );

    for (const row of anyAlloc) {
      billIdsWithAllocations.add(row.apBillId);
      if (row.targetType === 'project' && row.projectId === projectId) {
        allocationLines.push({
          billId: row.apBillId,
          projectId: row.projectId,
          amount: row.amount,
          currency: row.currency,
        });
      }
    }
  }

  const resolved = resolveVendorBillProjectAmounts({
    projectId,
    currency: normalized,
    headerBills: billRows.map((row) => ({
      billId: row.id,
      projectId: row.projectId,
      totalAmount: row.netAmount ?? row.totalAmount,
      currency: row.currency,
    })),
    allocationLines,
    billIdsWithAllocations,
  });

  const billIds = [...new Set(resolved.billIds)];
  const appliedByBillId = await getVendorPaymentsRepository().listActiveAppliedAmountsForBills(
    db,
    organizationId,
    billIds,
  );
  const creditsByBillId = await listActiveCreditAmountsForBills(db, organizationId, billIds);

  const billById = new Map(billRows.map((row) => [row.id, row]));
  let total = zeroMoney(normalized);
  let excludedForeignCurrencyCount = 0;
  let billCount = 0;
  const countedBills = new Set<string>();

  for (let i = 0; i < resolved.amounts.length; i += 1) {
    const sliceAmount = resolved.amounts[i]!;
    const billId = resolved.billIds[i]!;
    const row = billById.get(billId);
    if (!row) continue;
    if (row.currency.toUpperCase() !== normalized) {
      excludedForeignCurrencyCount += 1;
      continue;
    }
    const billNet = row.netAmount ?? row.totalAmount;
    const outstanding = computeBillOutstanding({
      billStatus: row.status,
      billTotal: money(row.totalAmount, row.currency),
      applications: (appliedByBillId.get(billId) ?? []).map((amount) => ({
        appliedAmount: money(amount, row.currency),
        paymentStatus: 'recorded' as const,
      })),
      creditApplications: (creditsByBillId.get(billId) ?? []).map((amount) => ({
        appliedAmount: money(amount, row.currency),
        status: 'applied' as const,
      })),
      retentionHeldRemaining: money(row.retentionHeldRemaining, row.currency),
    });
    const sliceOutstanding = scaleBillOutstandingToProjectSlice({
      currency: normalized,
      billNetAmount: billNet,
      sliceAmount,
      billOutstanding: outstanding,
    });
    if (!isPositiveMoney(sliceOutstanding)) continue;
    total = addMoney(total, sliceOutstanding);
    if (!countedBills.has(billId)) {
      countedBills.add(billId);
      billCount += 1;
    }
  }

  return { total: roundMoney(total), excludedForeignCurrencyCount, billCount };
}

async function sumOpenApPayableForProjectHeaderOnly(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  normalized: string,
): Promise<{ total: MoneyValue; excludedForeignCurrencyCount: number; billCount: number }> {
  const rows = await db
    .select({
      id: apBills.id,
      status: apBills.status,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
      retentionHeldRemaining: apBills.retentionHeldRemaining,
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

  const billIds = rows.map((row) => row.id);
  const appliedByBillId = await getVendorPaymentsRepository().listActiveAppliedAmountsForBills(
    db,
    organizationId,
    billIds,
  );
  const creditsByBillId = await listActiveCreditAmountsForBills(db, organizationId, billIds);

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
      creditApplications: (creditsByBillId.get(row.id) ?? []).map((amount) => ({
        appliedAmount: money(amount, row.currency),
        status: 'applied' as const,
      })),
      retentionHeldRemaining: money(row.retentionHeldRemaining, row.currency),
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
  /** Accepted expense-match totals per expense id (amount-aware dedupe). */
  readonly linkedExpenseDeductions: ReadonlyMap<string, string>;
  readonly excludedForeignCurrencyCount: number;
  readonly billCount: number;
}

/**
 * Posted/approved vendor bills for a project - recognized Actual Vendor Cost.
 * Also returns accepted match totals per expense (amount-aware dedupe in compose).
 *
 * When `ap_bill_project_allocations` is available (0021 applied + gate on):
 * bills with allocation rows attribute via lines only; header project_id is ignored
 * for those bills. Otherwise header-only behavior (pre-0021) is preserved.
 */
export async function loadRecognizedVendorBillsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<RecognizedVendorBillRollup> {
  const normalized = currency.toUpperCase();
  const useAllocations = areApBillProjectAllocationsAvailable();

  const billRows = await db
    .select({
      id: apBills.id,
      projectId: apBills.projectId,
      totalAmount: apBills.totalAmount,
      netAmount: apBills.netAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
        useAllocations
          ? sql`(
              ${apBills.projectId} = ${projectId}
              OR EXISTS (
                SELECT 1 FROM ${apBillProjectAllocations} a
                WHERE a.ap_bill_id = ${apBills.id}
                  AND a.organization_id = ${organizationId}
                  AND a.target_type = 'project'
                  AND a.project_id = ${projectId}
                  AND a.status = 'applied'
              )
            )`
          : eq(apBills.projectId, projectId),
      ),
    );

  const allocationLines: { billId: string; projectId: string; amount: string; currency: string }[] =
    [];
  const billIdsWithAllocations = new Set<string>();

  if (useAllocations && billRows.length > 0) {
    const allIds = billRows.map((row) => row.id);
    const anyAlloc = await db
      .select({
        apBillId: apBillProjectAllocations.apBillId,
        projectId: apBillProjectAllocations.projectId,
        amount: apBillProjectAllocations.amount,
        currency: apBillProjectAllocations.currency,
        targetType: apBillProjectAllocations.targetType,
        status: apBillProjectAllocations.status,
      })
      .from(apBillProjectAllocations)
      .where(
        and(
          eq(apBillProjectAllocations.organizationId, organizationId),
          inArray(apBillProjectAllocations.apBillId, allIds),
          eq(apBillProjectAllocations.status, 'applied'),
        ),
      );

    for (const row of anyAlloc) {
      billIdsWithAllocations.add(row.apBillId);
      if (row.targetType === 'project' && row.projectId === projectId) {
        allocationLines.push({
          billId: row.apBillId,
          projectId: row.projectId,
          amount: row.amount,
          currency: row.currency,
        });
      }
    }
  }

  const resolved = resolveVendorBillProjectAmounts({
    projectId,
    currency: normalized,
    headerBills: billRows.map((row) => ({
      billId: row.id,
      projectId: row.projectId,
      totalAmount: row.netAmount ?? row.totalAmount,
      currency: row.currency,
    })),
    allocationLines,
    billIdsWithAllocations: useAllocations ? billIdsWithAllocations : new Set(),
  });

  const billAmounts: string[] = [];
  let total = zeroMoney(normalized);
  let excludedForeignCurrencyCount = 0;
  const recognizedBillIds: string[] = [];

  // Count FX exclusions from header rows that were candidates but filtered.
  for (const row of billRows) {
    if (row.currency.toUpperCase() === normalized) continue;
    if (useAllocations && billIdsWithAllocations.has(row.id)) {
      // Allocation path already currency-filters lines; still disclose FX header.
    }
    if (row.projectId === projectId || (useAllocations && billIdsWithAllocations.has(row.id))) {
      excludedForeignCurrencyCount += 1;
    }
  }

  const billNetById = new Map(
    billRows.map((row) => [row.id, row.netAmount ?? row.totalAmount]),
  );
  const creditsByBill = await listActiveCreditActualReductionsForBills(
    db,
    organizationId,
    resolved.billIds,
  );

  for (let i = 0; i < resolved.amounts.length; i += 1) {
    const amountStr = resolved.amounts[i]!;
    const billId = resolved.billIds[i]!;
    const billNet = billNetById.get(billId) ?? amountStr;
    const netted = netProjectSliceAfterCredits({
      currency: normalized,
      billNetAmount: billNet,
      sliceAmount: amountStr,
      creditActualReductions: creditsByBill.get(billId) ?? [],
      projectId,
    });
    if (isZeroMoney(netted) || !isPositiveMoney(netted)) continue;
    billAmounts.push(netted.amount);
    total = addMoney(total, netted);
    recognizedBillIds.push(billId);
  }

  let linkedExpenseDeductions = new Map<string, string>();
  if (recognizedBillIds.length > 0) {
    const linkedRows = await db
      .select({
        expenseId: apPoMatches.expenseId,
        matchedAmount: apPoMatches.matchedAmount,
        expenseCurrency: expenses.currency,
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

    linkedExpenseDeductions = buildLinkedExpenseDeductions(
      linkedRows.flatMap((row) =>
        row.expenseId
          ? [
              {
                expenseId: row.expenseId,
                matchedAmount: row.matchedAmount,
                expenseCurrency: row.expenseCurrency,
              },
            ]
          : [],
      ),
      normalized,
    );
  }

  return {
    billAmounts,
    total: roundMoney(total),
    linkedExpenseDeductions,
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
 * Open committed costs for many projects - one query, grouped in memory.
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
 * Open AP cash payable for many projects - bills + one active-payment-applications query.
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
  for (const projectId of projectIds) {
    result.set(projectId, {
      total: zeroMoney(normalized),
      excludedForeignCurrencyCount: 0,
      billCount: 0,
    });
  }

  if (!areApBillProjectAllocationsAvailable()) {
    const rows = await db
      .select({
        id: apBills.id,
        projectId: apBills.projectId,
        status: apBills.status,
        totalAmount: apBills.totalAmount,
        currency: apBills.currency,
        retentionHeldRemaining: apBills.retentionHeldRemaining,
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

    const billIds = rows.map((row) => row.id);
    const appliedByBillId = await getVendorPaymentsRepository().listActiveAppliedAmountsForBills(
      db,
      organizationId,
      billIds,
    );
    const creditsByBillId = await listActiveCreditAmountsForBills(db, organizationId, billIds);

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
        creditApplications: (creditsByBillId.get(row.id) ?? []).map((amount) => ({
          appliedAmount: money(amount, row.currency),
          status: 'applied' as const,
        })),
        retentionHeldRemaining: money(row.retentionHeldRemaining, row.currency),
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

  // Allocations-aware set-based path (replaces O(N) serial per-project loads).
  const projectIdList = [...projectIds];
  const billRows = await db
    .select({
      id: apBills.id,
      projectId: apBills.projectId,
      status: apBills.status,
      totalAmount: apBills.totalAmount,
      netAmount: apBills.netAmount,
      currency: apBills.currency,
      retentionHeldRemaining: apBills.retentionHeldRemaining,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.status, [...OPEN_AP_CASH_STATUSES]),
        isNull(apBills.archivedAt),
        or(
          inArray(apBills.projectId, projectIdList),
          sql`EXISTS (
            SELECT 1 FROM ${apBillProjectAllocations} a
            WHERE a.ap_bill_id = ${apBills.id}
              AND a.organization_id = ${organizationId}
              AND a.target_type = 'project'
              AND a.project_id IN (${sql.join(
                projectIdList.map((id) => sql`${id}`),
                sql`, `,
              )})
              AND a.status = 'applied'
          )`,
        ),
      ),
    );

  if (billRows.length === 0) return result;

  const allIds = billRows.map((row) => row.id);
  const anyAlloc = await db
    .select({
      apBillId: apBillProjectAllocations.apBillId,
      projectId: apBillProjectAllocations.projectId,
      amount: apBillProjectAllocations.amount,
      currency: apBillProjectAllocations.currency,
      targetType: apBillProjectAllocations.targetType,
      status: apBillProjectAllocations.status,
    })
    .from(apBillProjectAllocations)
    .where(
      and(
        eq(apBillProjectAllocations.organizationId, organizationId),
        inArray(apBillProjectAllocations.apBillId, allIds),
        eq(apBillProjectAllocations.status, 'applied'),
      ),
    );

  const billIdsWithAllocations = new Set<string>();
  const allocationLinesByProject = new Map<
    string,
    { billId: string; projectId: string; amount: string; currency: string }[]
  >();
  const projectIdSet = new Set(projectIds);
  for (const row of anyAlloc) {
    billIdsWithAllocations.add(row.apBillId);
    if (row.targetType !== 'project' || !row.projectId || !projectIdSet.has(row.projectId)) {
      continue;
    }
    const list = allocationLinesByProject.get(row.projectId) ?? [];
    list.push({
      billId: row.apBillId,
      projectId: row.projectId,
      amount: row.amount,
      currency: row.currency,
    });
    allocationLinesByProject.set(row.projectId, list);
  }

  const appliedByBillId = await getVendorPaymentsRepository().listActiveAppliedAmountsForBills(
    db,
    organizationId,
    allIds,
  );
  const creditsByBillId = await listActiveCreditAmountsForBills(db, organizationId, allIds);
  const billById = new Map(billRows.map((row) => [row.id, row]));
  const headerBills = billRows.map((row) => ({
    billId: row.id,
    projectId: row.projectId,
    totalAmount: row.netAmount ?? row.totalAmount,
    currency: row.currency,
  }));

  for (const projectId of projectIds) {
    const resolved = resolveVendorBillProjectAmounts({
      projectId,
      currency: normalized,
      headerBills,
      allocationLines: allocationLinesByProject.get(projectId) ?? [],
      billIdsWithAllocations,
    });

    let total = zeroMoney(normalized);
    let excludedForeignCurrencyCount = 0;
    let billCount = 0;
    const countedBills = new Set<string>();

    for (let i = 0; i < resolved.amounts.length; i += 1) {
      const sliceAmount = resolved.amounts[i]!;
      const billId = resolved.billIds[i]!;
      const row = billById.get(billId);
      if (!row) continue;
      if (row.currency.toUpperCase() !== normalized) {
        excludedForeignCurrencyCount += 1;
        continue;
      }
      const billNet = row.netAmount ?? row.totalAmount;
      const outstanding = computeBillOutstanding({
        billStatus: row.status,
        billTotal: money(row.totalAmount, row.currency),
        applications: (appliedByBillId.get(billId) ?? []).map((amount) => ({
          appliedAmount: money(amount, row.currency),
          paymentStatus: 'recorded' as const,
        })),
        creditApplications: (creditsByBillId.get(billId) ?? []).map((amount) => ({
          appliedAmount: money(amount, row.currency),
          status: 'applied' as const,
        })),
        retentionHeldRemaining: money(row.retentionHeldRemaining, row.currency),
      });
      const sliceOutstanding = scaleBillOutstandingToProjectSlice({
        currency: normalized,
        billNetAmount: billNet,
        sliceAmount,
        billOutstanding: outstanding,
      });
      if (!isPositiveMoney(sliceOutstanding)) continue;
      total = addMoney(total, sliceOutstanding);
      if (!countedBills.has(billId)) {
        countedBills.add(billId);
        billCount += 1;
      }
    }

    result.set(projectId, {
      total: roundMoney(total),
      excludedForeignCurrencyCount,
      billCount,
    });
  }

  return result;
}

/**
 * Recognized vendor bills for many projects - bills + linked expenses in two queries.
 * Honors allocation-line precedence when the 0021 allocations gate is on.
 */
export async function loadRecognizedVendorBillsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
): Promise<Map<string, RecognizedVendorBillRollup>> {
  const result = new Map<string, RecognizedVendorBillRollup>();
  if (projectIds.length === 0) return result;

  if (!areApBillProjectAllocationsAvailable()) {
    // Pre-0021 path: header project_id only.
    const normalized = currency.toUpperCase();
    const billRows = await db
      .select({
        id: apBills.id,
        projectId: apBills.projectId,
        totalAmount: apBills.totalAmount,
        netAmount: apBills.netAmount,
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
      {
        billAmounts: string[];
        total: MoneyValue;
        excluded: number;
        recognizedBillIds: string[];
        billNets: Map<string, string>;
      }
    >();

    for (const row of billRows) {
      if (!row.projectId) continue;
      const bucket = billAmountsByProject.get(row.projectId) ?? {
        billAmounts: [],
        total: zeroMoney(normalized),
        excluded: 0,
        recognizedBillIds: [],
        billNets: new Map<string, string>(),
      };
      if (row.currency.toUpperCase() !== normalized) {
        bucket.excluded += 1;
        billAmountsByProject.set(row.projectId, bucket);
        continue;
      }
      const amount = fromNumericString(row.netAmount ?? row.totalAmount, row.currency);
      if (!amount) {
        billAmountsByProject.set(row.projectId, bucket);
        continue;
      }
      bucket.billAmounts.push(row.netAmount ?? row.totalAmount);
      bucket.total = addMoney(bucket.total, amount);
      bucket.recognizedBillIds.push(row.id);
      bucket.billNets.set(row.id, row.netAmount ?? row.totalAmount);
      billAmountsByProject.set(row.projectId, bucket);
    }

    const creditsByBill = await listActiveCreditActualReductionsForBills(
      db,
      organizationId,
      [...billAmountsByProject.values()].flatMap((bucket) => bucket.recognizedBillIds),
    );

    // Re-net amounts after credits.
    for (const [projectId, bucket] of billAmountsByProject) {
      const netAmounts: string[] = [];
      const netIds: string[] = [];
      let netTotal = zeroMoney(normalized);
      for (let i = 0; i < bucket.billAmounts.length; i += 1) {
        const billId = bucket.recognizedBillIds[i]!;
        const slice = bucket.billAmounts[i]!;
        const netted = netProjectSliceAfterCredits({
          currency: normalized,
          billNetAmount: bucket.billNets.get(billId) ?? slice,
          sliceAmount: slice,
          creditActualReductions: creditsByBill.get(billId) ?? [],
          projectId,
        });
        if (isZeroMoney(netted) || !isPositiveMoney(netted)) continue;
        netAmounts.push(netted.amount);
        netIds.push(billId);
        netTotal = addMoney(netTotal, netted);
      }
      bucket.billAmounts = netAmounts;
      bucket.recognizedBillIds = netIds;
      bucket.total = netTotal;
    }

    const allRecognizedIds = [...billAmountsByProject.values()].flatMap(
      (bucket) => bucket.recognizedBillIds,
    );

    const linkedByBill = new Map<
      string,
      { expenseId: string; matchedAmount: string; expenseCurrency: string }[]
    >();
    if (allRecognizedIds.length > 0) {
      const linkedRows = await db
        .select({
          apBillId: apPoMatches.apBillId,
          expenseId: apPoMatches.expenseId,
          matchedAmount: apPoMatches.matchedAmount,
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
        list.push({
          expenseId: row.expenseId,
          matchedAmount: row.matchedAmount,
          expenseCurrency: row.expenseCurrency,
        });
        linkedByBill.set(row.apBillId, list);
      }
    }

    for (const projectId of projectIds) {
      const bucket = billAmountsByProject.get(projectId);
      if (!bucket) {
        result.set(projectId, {
          billAmounts: [],
          total: zeroMoney(normalized),
          linkedExpenseDeductions: new Map(),
          excludedForeignCurrencyCount: 0,
          billCount: 0,
        });
        continue;
      }
      const matchRows: { expenseId: string; matchedAmount: string; expenseCurrency: string }[] =
        [];
      for (const billId of bucket.recognizedBillIds) {
        matchRows.push(...(linkedByBill.get(billId) ?? []));
      }
      const linkedExpenseDeductions = buildLinkedExpenseDeductions(matchRows, normalized);
      result.set(projectId, {
        billAmounts: bucket.billAmounts,
        total: roundMoney(bucket.total),
        linkedExpenseDeductions,
        excludedForeignCurrencyCount: bucket.excluded,
        billCount: bucket.billAmounts.length,
      });
    }
    return result;
  }

  // Allocations-aware set-based path — O(1) query groups, not O(N) single-project loads.
  const normalized = currency.toUpperCase();
  const projectIdList = [...projectIds];
  for (const projectId of projectIds) {
    result.set(projectId, {
      billAmounts: [],
      total: zeroMoney(normalized),
      linkedExpenseDeductions: new Map(),
      excludedForeignCurrencyCount: 0,
      billCount: 0,
    });
  }

  const billRows = await db
    .select({
      id: apBills.id,
      projectId: apBills.projectId,
      totalAmount: apBills.totalAmount,
      netAmount: apBills.netAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
        or(
          inArray(apBills.projectId, projectIdList),
          sql`EXISTS (
            SELECT 1 FROM ${apBillProjectAllocations} a
            WHERE a.ap_bill_id = ${apBills.id}
              AND a.organization_id = ${organizationId}
              AND a.target_type = 'project'
              AND a.project_id IN (${sql.join(
                projectIdList.map((id) => sql`${id}`),
                sql`, `,
              )})
              AND a.status = 'applied'
          )`,
        ),
      ),
    );

  if (billRows.length === 0) return result;

  const allIds = billRows.map((row) => row.id);
  const anyAlloc = await db
    .select({
      apBillId: apBillProjectAllocations.apBillId,
      projectId: apBillProjectAllocations.projectId,
      amount: apBillProjectAllocations.amount,
      currency: apBillProjectAllocations.currency,
      targetType: apBillProjectAllocations.targetType,
      status: apBillProjectAllocations.status,
    })
    .from(apBillProjectAllocations)
    .where(
      and(
        eq(apBillProjectAllocations.organizationId, organizationId),
        inArray(apBillProjectAllocations.apBillId, allIds),
        eq(apBillProjectAllocations.status, 'applied'),
      ),
    );

  const billIdsWithAllocations = new Set<string>();
  const allocationLinesByProject = new Map<
    string,
    { billId: string; projectId: string; amount: string; currency: string }[]
  >();
  const projectIdSet = new Set(projectIds);
  for (const row of anyAlloc) {
    billIdsWithAllocations.add(row.apBillId);
    if (row.targetType !== 'project' || !row.projectId || !projectIdSet.has(row.projectId)) {
      continue;
    }
    const list = allocationLinesByProject.get(row.projectId) ?? [];
    list.push({
      billId: row.apBillId,
      projectId: row.projectId,
      amount: row.amount,
      currency: row.currency,
    });
    allocationLinesByProject.set(row.projectId, list);
  }

  const headerBills = billRows.map((row) => ({
    billId: row.id,
    projectId: row.projectId,
    totalAmount: row.netAmount ?? row.totalAmount,
    currency: row.currency,
  }));
  const billNetById = new Map(
    billRows.map((row) => [row.id, row.netAmount ?? row.totalAmount] as const),
  );
  const billCurrencyById = new Map(billRows.map((row) => [row.id, row.currency] as const));

  const resolvedBillIds = new Set<string>();
  const perProjectResolved = new Map<string, { amounts: string[]; billIds: string[] }>();
  for (const projectId of projectIds) {
    const resolved = resolveVendorBillProjectAmounts({
      projectId,
      currency: normalized,
      headerBills,
      allocationLines: allocationLinesByProject.get(projectId) ?? [],
      billIdsWithAllocations,
    });
    perProjectResolved.set(projectId, { amounts: [...resolved.amounts], billIds: [...resolved.billIds] });
    for (const billId of resolved.billIds) resolvedBillIds.add(billId);
  }

  const creditsByBill = await listActiveCreditActualReductionsForBills(
    db,
    organizationId,
    [...resolvedBillIds],
  );

  const recognizedIdsByProject = new Map<string, string[]>();
  const allRecognizedIds: string[] = [];
  for (const projectId of projectIds) {
    const resolved = perProjectResolved.get(projectId)!;
    const billAmounts: string[] = [];
    const recognizedBillIds: string[] = [];
    let total = zeroMoney(normalized);
    let excludedForeignCurrencyCount = 0;

    for (const row of billRows) {
      if (row.currency.toUpperCase() === normalized) continue;
      const touchesProject =
        row.projectId === projectId ||
        (allocationLinesByProject.get(projectId) ?? []).some((line) => line.billId === row.id);
      if (touchesProject) excludedForeignCurrencyCount += 1;
    }

    for (let i = 0; i < resolved.amounts.length; i += 1) {
      const amountStr = resolved.amounts[i]!;
      const billId = resolved.billIds[i]!;
      if ((billCurrencyById.get(billId) ?? '').toUpperCase() !== normalized) continue;
      const billNet = billNetById.get(billId) ?? amountStr;
      const netted = netProjectSliceAfterCredits({
        currency: normalized,
        billNetAmount: billNet,
        sliceAmount: amountStr,
        creditActualReductions: creditsByBill.get(billId) ?? [],
        projectId,
      });
      if (isZeroMoney(netted) || !isPositiveMoney(netted)) continue;
      billAmounts.push(netted.amount);
      total = addMoney(total, netted);
      recognizedBillIds.push(billId);
      allRecognizedIds.push(billId);
    }

    recognizedIdsByProject.set(projectId, recognizedBillIds);
    result.set(projectId, {
      billAmounts,
      total: roundMoney(total),
      linkedExpenseDeductions: new Map(),
      excludedForeignCurrencyCount,
      billCount: billAmounts.length,
    });
  }

  const linkedByBill = new Map<
    string,
    { expenseId: string; matchedAmount: string; expenseCurrency: string }[]
  >();
  const uniqueRecognizedIds = [...new Set(allRecognizedIds)];
  if (uniqueRecognizedIds.length > 0) {
    const linkedRows = await db
      .select({
        apBillId: apPoMatches.apBillId,
        expenseId: apPoMatches.expenseId,
        matchedAmount: apPoMatches.matchedAmount,
        expenseCurrency: expenses.currency,
      })
      .from(apPoMatches)
      .innerJoin(expenses, eq(expenses.id, apPoMatches.expenseId))
      .where(
        and(
          eq(apPoMatches.organizationId, organizationId),
          inArray(apPoMatches.apBillId, uniqueRecognizedIds),
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
      list.push({
        expenseId: row.expenseId,
        matchedAmount: row.matchedAmount,
        expenseCurrency: row.expenseCurrency,
      });
      linkedByBill.set(row.apBillId, list);
    }
  }

  for (const projectId of projectIds) {
    const current = result.get(projectId)!;
    const matchRows: { expenseId: string; matchedAmount: string; expenseCurrency: string }[] = [];
    for (const billId of recognizedIdsByProject.get(projectId) ?? []) {
      matchRows.push(...(linkedByBill.get(billId) ?? []));
    }
    result.set(projectId, {
      ...current,
      linkedExpenseDeductions: buildLinkedExpenseDeductions(matchRows, normalized),
    });
  }

  return result;
}
