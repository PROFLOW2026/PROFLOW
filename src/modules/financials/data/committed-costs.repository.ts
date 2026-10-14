import { and, eq, inArray, isNotNull, isNull, or, sql } from 'drizzle-orm';
import {
  apBillProjectAllocations,
  apBills,
  apPoMatches,
  committedCosts,
  expenseAllocations,
  expenses,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  apBillNotStockPurchaseSql,
  apBillStockLineNetSql,
  operatingSliceAfterStockLines,
} from '@/modules/ap/domain/inventory-stock-purchase';
import {
  applyPartialMatchPolicyToRecognizedVendorRollup,
  buildProjectLinkedExpenseDeductions,
  distributeMatchedAmountByExpenseWeights,
  scaleAmountByExpenseProjectWeight,
  type ExpenseProjectWeight,
  type RecognizedBillMatchLink,
} from '@/modules/financials/domain/expense-ap-dedup';
import {
  addMoney,
  compareMoney,
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
  netProjectSliceAfterCredits,
  listActiveCreditActualReductionsForBills,
} from '@/modules/ap';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
import { foldRecognizedVendorBillsForProjectsFromFacts, getApOrgReadFactsCache } from '@/modules/ap';
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
  /** Parallel to `billAmounts` (post partial-match cap). */
  readonly recognizedBillIds: readonly string[];
  readonly billMatchLinks: readonly RecognizedBillMatchLink[];
}

const EMPTY_VENDOR_ROLLUP_FIELDS = {
  recognizedBillIds: [] as readonly string[],
  billMatchLinks: [] as readonly RecognizedBillMatchLink[],
};

async function loadExpenseProjectNetWeightsByIds(
  db: DbExecutor,
  organizationId: string,
  expenseIds: readonly string[],
): Promise<Map<string, readonly ExpenseProjectWeight[]>> {
  const map = new Map<string, ExpenseProjectWeight[]>();
  if (expenseIds.length === 0) return map;

  const allocRows = await db
    .select({
      expenseId: expenseAllocations.expenseId,
      projectId: expenseAllocations.projectId,
      amount: expenseAllocations.amount,
    })
    .from(expenseAllocations)
    .where(
      and(
        eq(expenseAllocations.organizationId, organizationId),
        inArray(expenseAllocations.expenseId, [...expenseIds]),
        eq(expenseAllocations.targetType, 'project'),
        isNotNull(expenseAllocations.projectId),
      ),
    );

  for (const row of allocRows) {
    if (!row.projectId) continue;
    const list = map.get(row.expenseId) ?? [];
    list.push({ projectId: row.projectId, weightNet: row.amount });
    map.set(row.expenseId, list);
  }

  const missing = expenseIds.filter((id) => !map.has(id));
  if (missing.length > 0) {
    const headers = await db
      .select({
        id: expenses.id,
        projectId: expenses.projectId,
        netAmount: expenses.netAmount,
      })
      .from(expenses)
      .where(
        and(eq(expenses.organizationId, organizationId), inArray(expenses.id, [...missing])),
      );
    for (const row of headers) {
      if (row.projectId) {
        map.set(row.id, [{ projectId: row.projectId, weightNet: row.netAmount }]);
      }
    }
  }

  return map;
}

type LinkedExpenseMatchDbRow = {
  readonly expenseId: string;
  readonly matchedAmount: string;
  readonly expenseCurrency: string;
  readonly expenseNetAmount: string;
  readonly expenseGrossAmount: string;
};

function scaleRecognizedBillSliceForSplitExpense(input: {
  readonly amount: string;
  readonly billId: string;
  readonly projectId: string;
  readonly currency: string;
  readonly billIdsWithAllocations: ReadonlySet<string>;
  readonly linkedByBill: ReadonlyMap<string, readonly { readonly expenseId: string }[]>;
  readonly weightsByExpenseId: ReadonlyMap<string, readonly ExpenseProjectWeight[]>;
}): string {
  if (input.billIdsWithAllocations.has(input.billId)) return input.amount;
  const links = input.linkedByBill.get(input.billId) ?? [];
  const expenseId = links[0]?.expenseId;
  if (!expenseId) return input.amount;
  const weights = input.weightsByExpenseId.get(expenseId);
  if (!weights || weights.length <= 1) return input.amount;
  return scaleAmountByExpenseProjectWeight({
    amount: input.amount,
    currency: input.currency,
    weights,
    projectId: input.projectId,
  });
}

type SplitExpenseTouchRow = {
  readonly apBillId: string;
  readonly expenseId: string | null;
  readonly matchedAmount: string;
  readonly expenseCurrency: string;
  readonly expenseNetAmount: string;
  readonly expenseGrossAmount: string;
  readonly expenseProjectId: string | null;
};

async function loadSplitExpenseTouchRowsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
): Promise<SplitExpenseTouchRow[]> {
  if (projectIds.length === 0) return [];
  const projectIdList = [...projectIds];
  return db
    .select({
      apBillId: apPoMatches.apBillId,
      expenseId: apPoMatches.expenseId,
      matchedAmount: apPoMatches.matchedAmount,
      expenseCurrency: expenses.currency,
      expenseNetAmount: expenses.netAmount,
      expenseGrossAmount: expenses.grossAmount,
      expenseProjectId: expenses.projectId,
    })
    .from(apPoMatches)
    .innerJoin(expenses, eq(expenses.id, apPoMatches.expenseId))
    .where(
      and(
        eq(apPoMatches.organizationId, organizationId),
        eq(apPoMatches.status, 'accepted'),
        isNotNull(apPoMatches.expenseId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        or(
          inArray(expenses.projectId, projectIdList),
          sql`EXISTS (
            SELECT 1 FROM ${expenseAllocations} a
            WHERE a.organization_id = ${organizationId}
              AND a.expense_id = ${expenses.id}
              AND a.target_type = 'project'
              AND a.project_id IN (${sql.join(
                projectIdList.map((id) => sql`${id}`),
                sql`, `,
              )})
          )`,
        ),
      ),
    );
}

function splitExpenseTouchRowTouchesProject(
  row: SplitExpenseTouchRow,
  projectId: string,
  weightsByExpenseId: ReadonlyMap<string, readonly ExpenseProjectWeight[]>,
): boolean {
  if (!row.expenseId) return false;
  if (row.expenseProjectId === projectId) return true;
  const weights = weightsByExpenseId.get(row.expenseId);
  return weights?.some((weight) => weight.projectId === projectId) ?? false;
}

async function augmentRollupWithSplitExpenseMatches(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
  rollup: RecognizedVendorBillRollup,
  billIdsWithAllocations: ReadonlySet<string>,
  preloadedTouchRows?: readonly SplitExpenseTouchRow[] | null,
): Promise<RecognizedVendorBillRollup> {
  const normalized = currency.toUpperCase();
  const recognizedSet = new Set(rollup.recognizedBillIds);

  const touchRows =
    preloadedTouchRows !== undefined && preloadedTouchRows !== null
      ? [...preloadedTouchRows]
      : await db
          .select({
            apBillId: apPoMatches.apBillId,
            expenseId: apPoMatches.expenseId,
            matchedAmount: apPoMatches.matchedAmount,
            expenseCurrency: expenses.currency,
            expenseNetAmount: expenses.netAmount,
            expenseGrossAmount: expenses.grossAmount,
            expenseProjectId: expenses.projectId,
          })
          .from(apPoMatches)
          .innerJoin(expenses, eq(expenses.id, apPoMatches.expenseId))
          .where(
            and(
              eq(apPoMatches.organizationId, organizationId),
              eq(apPoMatches.status, 'accepted'),
              isNotNull(apPoMatches.expenseId),
              eq(expenses.status, 'finalized'),
              isNull(expenses.archivedAt),
              or(
                eq(expenses.projectId, projectId),
                sql`EXISTS (
                  SELECT 1 FROM ${expenseAllocations} a
                  WHERE a.organization_id = ${organizationId}
                    AND a.expense_id = ${expenses.id}
                    AND a.target_type = 'project'
                    AND a.project_id = ${projectId}
                )`,
              ),
            ),
          );

  const matchRows: LinkedExpenseMatchDbRow[] = [];
  for (const row of touchRows) {
    if (!row.expenseId || row.expenseCurrency.toUpperCase() !== normalized) continue;
    matchRows.push({
      expenseId: row.expenseId,
      matchedAmount: row.matchedAmount,
      expenseCurrency: row.expenseCurrency,
      expenseNetAmount: row.expenseNetAmount,
      expenseGrossAmount: row.expenseGrossAmount,
    });
  }
  if (matchRows.length === 0) return rollup;

  const expenseIds = [...new Set(matchRows.map((row) => row.expenseId))];
  const weightsByExpenseId = await loadExpenseProjectNetWeightsByIds(db, organizationId, expenseIds);

  const linkedExpenseDeductions = new Map(rollup.linkedExpenseDeductions);
  for (const [expenseId, amount] of buildProjectLinkedExpenseDeductions(
    matchRows,
    projectId,
    weightsByExpenseId,
    normalized,
  )) {
    const prev = linkedExpenseDeductions.get(expenseId);
    linkedExpenseDeductions.set(
      expenseId,
      prev ? addMoney(money(prev, normalized), money(amount, normalized)).amount : amount,
    );
  }

  const linkedByBill = new Map<string, LinkedExpenseMatchDbRow[]>();
  for (const row of touchRows) {
    if (!row.expenseId) continue;
    const list = linkedByBill.get(row.apBillId) ?? [];
    list.push({
      expenseId: row.expenseId,
      matchedAmount: row.matchedAmount,
      expenseCurrency: row.expenseCurrency,
      expenseNetAmount: row.expenseNetAmount,
      expenseGrossAmount: row.expenseGrossAmount,
    });
    linkedByBill.set(row.apBillId, list);
  }

  const extraBillIds = [...new Set(touchRows.map((row) => row.apBillId))].filter(
    (billId) => !recognizedSet.has(billId) && !billIdsWithAllocations.has(billId),
  );

  const billAmounts = [...rollup.billAmounts];
  const recognizedBillIds = [...rollup.recognizedBillIds];
  let total = rollup.total;
  let billMatchLinks = [...rollup.billMatchLinks];

  if (extraBillIds.length > 0) {
    const extraBills = await db
      .select({
        id: apBills.id,
        netAmount: apBills.netAmount,
        totalAmount: apBills.totalAmount,
        currency: apBills.currency,
        stockLineNet: apBillStockLineNetSql(),
      })
      .from(apBills)
      .where(
        and(
          eq(apBills.organizationId, organizationId),
          inArray(apBills.id, extraBillIds),
          inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
          isNull(apBills.archivedAt),
          apBillNotStockPurchaseSql(),
        ),
      );

    const creditsByBill = await listActiveCreditActualReductionsForBills(
      db,
      organizationId,
      extraBillIds,
    );

    for (const bill of extraBills) {
      if (bill.currency.toUpperCase() !== normalized) continue;
      const billNet = bill.netAmount ?? bill.totalAmount;
      const operating = operatingSliceAfterStockLines({
        sliceAmount: billNet,
        billNetAmount: billNet,
        stockLineNet: String(bill.stockLineNet ?? '0'),
        currency: bill.currency,
      });
      const netted = netProjectSliceAfterCredits({
        currency: normalized,
        billNetAmount: billNet,
        sliceAmount: operating.amount,
        creditActualReductions: creditsByBill.get(bill.id) ?? [],
        projectId,
      });
      const scaled = scaleRecognizedBillSliceForSplitExpense({
        amount: netted.amount,
        billId: bill.id,
        projectId,
        currency: normalized,
        billIdsWithAllocations,
        linkedByBill,
        weightsByExpenseId,
      });
      const parsed = money(scaled, normalized);
      if (!isPositiveMoney(parsed)) continue;
      billAmounts.push(parsed.amount);
      recognizedBillIds.push(bill.id);
      total = addMoney(total, parsed);
    }

    billMatchLinks = [
      ...billMatchLinks,
      ...projectScopedBillMatchLinks(
        recognizedBillIds.filter((id) => extraBillIds.includes(id)),
        linkedByBill,
        projectId,
        weightsByExpenseId,
        normalized,
      ),
    ];
  }

  return {
    ...rollup,
    billAmounts,
    recognizedBillIds,
    total: roundMoney(total),
    billCount: billAmounts.length,
    linkedExpenseDeductions,
    billMatchLinks,
  };
}

function projectScopedBillMatchLinks(
  billIds: readonly string[],
  linkedByBill: ReadonlyMap<string, readonly LinkedExpenseMatchDbRow[]>,
  projectId: string,
  weightsByExpenseId: ReadonlyMap<string, readonly ExpenseProjectWeight[]>,
  currency: string,
): RecognizedBillMatchLink[] {
  const links: RecognizedBillMatchLink[] = [];
  for (const billId of billIds) {
    for (const row of linkedByBill.get(billId) ?? []) {
      const weights = weightsByExpenseId.get(row.expenseId);
      const matchedAmount =
        weights && weights.length > 1
          ? distributeMatchedAmountByExpenseWeights({
              matchedAmount: row.matchedAmount,
              currency,
              weights,
              projectId,
            })
          : weights && weights.length === 1 && weights[0]!.projectId !== projectId
            ? '0'
            : row.matchedAmount;
      if (compareMoney(money(matchedAmount, currency), zeroMoney(currency)) <= 0) continue;
      links.push({ billId, expenseId: row.expenseId, matchedAmount });
    }
  }
  return links;
}

async function loadExpenseNetAmountsById(
  db: DbExecutor,
  organizationId: string,
  expenseIds: readonly string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (expenseIds.length === 0) return map;
  const rows = await db
    .select({ id: expenses.id, netAmount: expenses.netAmount })
    .from(expenses)
    .where(
      and(
        eq(expenses.organizationId, organizationId),
        inArray(expenses.id, [...expenseIds]),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
      ),
    );
  for (const row of rows) {
    map.set(row.id, row.netAmount);
  }
  return map;
}

async function applyPartialMatchPolicyToLoadedRollup(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  rollup: RecognizedVendorBillRollup,
): Promise<RecognizedVendorBillRollup> {
  const expenseIds = [...rollup.linkedExpenseDeductions.keys()];
  const expenseNetFallback = await loadExpenseNetAmountsById(db, organizationId, expenseIds);
  return applyPartialMatchPolicyToRecognizedVendorRollup(rollup, {
    currency,
    expenseNetFallback,
  });
}

async function applyPartialMatchPolicyToRollupMap(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  rollups: Map<string, RecognizedVendorBillRollup>,
): Promise<Map<string, RecognizedVendorBillRollup>> {
  const expenseIds = new Set<string>();
  for (const rollup of rollups.values()) {
    for (const expenseId of rollup.linkedExpenseDeductions.keys()) {
      expenseIds.add(expenseId);
    }
  }
  const expenseNetFallback = await loadExpenseNetAmountsById(db, organizationId, [...expenseIds]);
  const next = new Map<string, RecognizedVendorBillRollup>();
  for (const [projectId, rollup] of rollups) {
    next.set(
      projectId,
      applyPartialMatchPolicyToRecognizedVendorRollup(rollup, {
        currency,
        expenseNetFallback,
      }),
    );
  }
  return next;
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
      stockLineNet: apBillStockLineNetSql(),
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
        apBillNotStockPurchaseSql(),
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

  const preScaleBillAmounts: string[] = [];
  for (let i = 0; i < resolved.amounts.length; i += 1) {
    const amountStr = resolved.amounts[i]!;
    const billId = resolved.billIds[i]!;
    const billNet = billNetById.get(billId) ?? amountStr;
    const operating = operatingSliceAfterStockLines({
      sliceAmount: amountStr,
      billNetAmount: billNet,
      stockLineNet: billRows.find((row) => row.id === billId)?.stockLineNet ?? '0',
      currency: normalized,
    });
    const netted = netProjectSliceAfterCredits({
      currency: normalized,
      billNetAmount: billNet,
      sliceAmount: operating.amount,
      creditActualReductions: creditsByBill.get(billId) ?? [],
      projectId,
    });
    if (isZeroMoney(netted) || !isPositiveMoney(netted)) continue;
    preScaleBillAmounts.push(netted.amount);
    recognizedBillIds.push(billId);
  }

  const linkedByBill = new Map<string, LinkedExpenseMatchDbRow[]>();
  let linkedExpenseDeductions = new Map<string, string>();
  let billMatchLinks: RecognizedBillMatchLink[] = [];
  const billIdsWithAllocationsSet = useAllocations ? billIdsWithAllocations : new Set<string>();

  if (recognizedBillIds.length > 0) {
    const linkedRows = await db
      .select({
        apBillId: apPoMatches.apBillId,
        expenseId: apPoMatches.expenseId,
        matchedAmount: apPoMatches.matchedAmount,
        expenseCurrency: expenses.currency,
        expenseNetAmount: expenses.netAmount,
        expenseGrossAmount: expenses.grossAmount,
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
      const list = linkedByBill.get(row.apBillId) ?? [];
      list.push({
        expenseId: row.expenseId,
        matchedAmount: row.matchedAmount,
        expenseCurrency: row.expenseCurrency,
        expenseNetAmount: row.expenseNetAmount,
        expenseGrossAmount: row.expenseGrossAmount,
      });
      linkedByBill.set(row.apBillId, list);
    }

    const expenseIds = [...new Set(linkedRows.map((row) => row.expenseId).filter(Boolean))] as string[];
    const weightsByExpenseId = await loadExpenseProjectNetWeightsByIds(db, organizationId, expenseIds);

    const scaledRecognizedBillIds: string[] = [];
    for (let i = 0; i < preScaleBillAmounts.length; i += 1) {
      const billId = recognizedBillIds[i]!;
      const scaled = scaleRecognizedBillSliceForSplitExpense({
        amount: preScaleBillAmounts[i]!,
        billId,
        projectId,
        currency: normalized,
        billIdsWithAllocations: billIdsWithAllocationsSet,
        linkedByBill,
        weightsByExpenseId,
      });
      const parsed = money(scaled, normalized);
      if (!isPositiveMoney(parsed)) continue;
      billAmounts.push(parsed.amount);
      scaledRecognizedBillIds.push(billId);
      total = addMoney(total, parsed);
    }
    recognizedBillIds.length = 0;
    recognizedBillIds.push(...scaledRecognizedBillIds);

    const matchRows = [...linkedByBill.values()].flat();
    linkedExpenseDeductions = buildProjectLinkedExpenseDeductions(
      matchRows,
      projectId,
      weightsByExpenseId,
      normalized,
    );
    billMatchLinks = projectScopedBillMatchLinks(
      recognizedBillIds,
      linkedByBill,
      projectId,
      weightsByExpenseId,
      normalized,
    );
  }

  let rollup: RecognizedVendorBillRollup = {
    billAmounts,
    total: roundMoney(total),
    linkedExpenseDeductions,
    excludedForeignCurrencyCount,
    billCount: billAmounts.length,
    recognizedBillIds,
    billMatchLinks,
  };

  rollup = await augmentRollupWithSplitExpenseMatches(
    db,
    organizationId,
    projectId,
    normalized,
    rollup,
    billIdsWithAllocationsSet,
  );

  return applyPartialMatchPolicyToLoadedRollup(db, organizationId, normalized, rollup);
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
function apBillRecognizedYearMonthSql() {
  return sql<string>`to_char(coalesce(${apBills.billDate}, (${apBills.createdAt}::timestamptz)::date), 'YYYY-MM')`;
}

export async function loadRecognizedVendorBillsForProjects(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  currency: string,
  options?: { readonly yearMonth?: string },
): Promise<Map<string, RecognizedVendorBillRollup>> {
  const cached = getApOrgReadFactsCache(db as object);
  if (cached && !options?.yearMonth) {
    const folded = foldRecognizedVendorBillsForProjectsFromFacts(cached, projectIds, currency);
    const result = new Map<string, RecognizedVendorBillRollup>();
    for (const [projectId, rollup] of folded) {
      result.set(projectId, {
        billAmounts: [...rollup.billAmounts],
        total: rollup.total,
        linkedExpenseDeductions: rollup.linkedExpenseDeductions,
        excludedForeignCurrencyCount: rollup.excludedForeignCurrencyCount,
        billCount: rollup.billCount,
        recognizedBillIds: [...rollup.recognizedBillIds],
        billMatchLinks: [...rollup.billMatchLinks],
      });
    }
    return applyPartialMatchPolicyToRollupMap(db, organizationId, currency, result);
  }

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
        stockLineNet: apBillStockLineNetSql(),
      })
      .from(apBills)
      .where(
        and(
          eq(apBills.organizationId, organizationId),
          inArray(apBills.projectId, [...projectIds]),
          inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
          isNull(apBills.archivedAt),
          apBillNotStockPurchaseSql(),
          ...(options?.yearMonth ? [eq(apBillRecognizedYearMonthSql(), options.yearMonth)] : []),
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
      const rawNet = row.netAmount ?? row.totalAmount;
      const operating = operatingSliceAfterStockLines({
        sliceAmount: rawNet,
        billNetAmount: rawNet,
        stockLineNet: String(row.stockLineNet ?? '0'),
        currency: row.currency,
      });
      if (!isPositiveMoney(operating)) {
        billAmountsByProject.set(row.projectId, bucket);
        continue;
      }
      bucket.billAmounts.push(operating.amount);
      bucket.total = addMoney(bucket.total, operating);
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
      {
        expenseId: string;
        matchedAmount: string;
        expenseCurrency: string;
        expenseNetAmount: string;
        expenseGrossAmount: string;
      }[]
    >();
    if (allRecognizedIds.length > 0) {
      const linkedRows = await db
        .select({
          apBillId: apPoMatches.apBillId,
          expenseId: apPoMatches.expenseId,
          matchedAmount: apPoMatches.matchedAmount,
          expenseCurrency: expenses.currency,
          expenseNetAmount: expenses.netAmount,
          expenseGrossAmount: expenses.grossAmount,
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
          expenseNetAmount: row.expenseNetAmount,
          expenseGrossAmount: row.expenseGrossAmount,
        });
        linkedByBill.set(row.apBillId, list);
      }
    }

    const expenseIdsForWeights = [
      ...new Set(
        [...linkedByBill.values()]
          .flat()
          .map((row) => row.expenseId),
      ),
    ];
    const weightsByExpenseId = await loadExpenseProjectNetWeightsByIds(
      db,
      organizationId,
      expenseIdsForWeights,
    );
    const emptyBillAllocations = new Set<string>();
    const projectIdListPreAlloc = [...projectIds];
    const splitTouchRowsPreAlloc = await loadSplitExpenseTouchRowsForProjects(
      db,
      organizationId,
      projectIdListPreAlloc,
    );
    let splitExpenseWeightsPreAlloc = weightsByExpenseId;
    if (splitTouchRowsPreAlloc.length > 0) {
      const splitExpenseIds = [
        ...new Set(
          splitTouchRowsPreAlloc
            .map((row) => row.expenseId)
            .filter((id): id is string => id != null),
        ),
      ];
      splitExpenseWeightsPreAlloc = await loadExpenseProjectNetWeightsByIds(
        db,
        organizationId,
        splitExpenseIds,
      );
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
          ...EMPTY_VENDOR_ROLLUP_FIELDS,
        });
        continue;
      }
      const matchRows: LinkedExpenseMatchDbRow[] = [];
      for (const billId of bucket.recognizedBillIds) {
        matchRows.push(...(linkedByBill.get(billId) ?? []));
      }
      const scaledBillAmounts: string[] = [];
      const scaledBillIds: string[] = [];
      let scaledTotal = zeroMoney(normalized);
      for (let i = 0; i < bucket.billAmounts.length; i += 1) {
        const billId = bucket.recognizedBillIds[i]!;
        const scaled = scaleRecognizedBillSliceForSplitExpense({
          amount: bucket.billAmounts[i]!,
          billId,
          projectId,
          currency: normalized,
          billIdsWithAllocations: emptyBillAllocations,
          linkedByBill,
          weightsByExpenseId,
        });
        const parsed = money(scaled, normalized);
        if (!isPositiveMoney(parsed)) continue;
        scaledBillAmounts.push(parsed.amount);
        scaledBillIds.push(billId);
        scaledTotal = addMoney(scaledTotal, parsed);
      }
      let rollup: RecognizedVendorBillRollup = {
        billAmounts: scaledBillAmounts,
        total: roundMoney(scaledTotal),
        linkedExpenseDeductions: buildProjectLinkedExpenseDeductions(
          matchRows,
          projectId,
          weightsByExpenseId,
          normalized,
        ),
        excludedForeignCurrencyCount: bucket.excluded,
        billCount: scaledBillAmounts.length,
        recognizedBillIds: scaledBillIds,
        billMatchLinks: projectScopedBillMatchLinks(
          scaledBillIds,
          linkedByBill,
          projectId,
          weightsByExpenseId,
          normalized,
        ),
      };
      if (splitTouchRowsPreAlloc.length > 0) {
        const projectTouchRows = splitTouchRowsPreAlloc.filter((row) =>
          splitExpenseTouchRowTouchesProject(row, projectId, splitExpenseWeightsPreAlloc),
        );
        rollup = await augmentRollupWithSplitExpenseMatches(
          db,
          organizationId,
          projectId,
          normalized,
          rollup,
          emptyBillAllocations,
          projectTouchRows,
        );
      }
      result.set(projectId, rollup);
    }
    return applyPartialMatchPolicyToRollupMap(db, organizationId, normalized, result);
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
      ...EMPTY_VENDOR_ROLLUP_FIELDS,
    });
  }

  const billRows = await db
    .select({
      id: apBills.id,
      projectId: apBills.projectId,
      totalAmount: apBills.totalAmount,
      netAmount: apBills.netAmount,
      currency: apBills.currency,
      stockLineNet: apBillStockLineNetSql(),
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
        apBillNotStockPurchaseSql(),
        ...(options?.yearMonth ? [eq(apBillRecognizedYearMonthSql(), options.yearMonth)] : []),
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
  const stockLineNetById = new Map(
    billRows.map((row) => [row.id, String(row.stockLineNet ?? '0')] as const),
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
      const operating = operatingSliceAfterStockLines({
        sliceAmount: amountStr,
        billNetAmount: billNet,
        stockLineNet: stockLineNetById.get(billId) ?? '0',
        currency: normalized,
      });
      const netted = netProjectSliceAfterCredits({
        currency: normalized,
        billNetAmount: billNet,
        sliceAmount: operating.amount,
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
      recognizedBillIds,
      billMatchLinks: [],
    });
  }

  const linkedByBill = new Map<
    string,
    {
      expenseId: string;
      matchedAmount: string;
      expenseCurrency: string;
      expenseNetAmount: string;
      expenseGrossAmount: string;
    }[]
  >();
  const uniqueRecognizedIds = [...new Set(allRecognizedIds)];
  if (uniqueRecognizedIds.length > 0) {
    const linkedRows = await db
      .select({
        apBillId: apPoMatches.apBillId,
        expenseId: apPoMatches.expenseId,
        matchedAmount: apPoMatches.matchedAmount,
        expenseCurrency: expenses.currency,
        expenseNetAmount: expenses.netAmount,
        expenseGrossAmount: expenses.grossAmount,
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
        expenseNetAmount: row.expenseNetAmount,
        expenseGrossAmount: row.expenseGrossAmount,
      });
      linkedByBill.set(row.apBillId, list);
    }
  }

  const expenseIdsForWeights = [
    ...new Set([...linkedByBill.values()].flat().map((row) => row.expenseId)),
  ];
  const weightsByExpenseId = await loadExpenseProjectNetWeightsByIds(
    db,
    organizationId,
    expenseIdsForWeights,
  );

  const splitTouchRows = await loadSplitExpenseTouchRowsForProjects(
    db,
    organizationId,
    projectIdList,
  );
  let splitExpenseWeights = weightsByExpenseId;
  if (splitTouchRows.length > 0) {
    const splitExpenseIds = [
      ...new Set(
        splitTouchRows
          .map((row) => row.expenseId)
          .filter((id): id is string => id != null),
      ),
    ];
    splitExpenseWeights = await loadExpenseProjectNetWeightsByIds(
      db,
      organizationId,
      splitExpenseIds,
    );
  }

  for (const projectId of projectIds) {
    const current = result.get(projectId)!;
    const matchRows: LinkedExpenseMatchDbRow[] = [];
    for (const billId of recognizedIdsByProject.get(projectId) ?? []) {
      matchRows.push(...(linkedByBill.get(billId) ?? []));
    }
    const recognizedBillIds = recognizedIdsByProject.get(projectId) ?? [];
    const scaledBillAmounts: string[] = [];
    const scaledBillIds: string[] = [];
    let scaledTotal = zeroMoney(normalized);
    for (let i = 0; i < current.billAmounts.length; i += 1) {
      const billId = recognizedBillIds[i]!;
      const scaled = scaleRecognizedBillSliceForSplitExpense({
        amount: current.billAmounts[i]!,
        billId,
        projectId,
        currency: normalized,
        billIdsWithAllocations: billIdsWithAllocations,
        linkedByBill,
        weightsByExpenseId,
      });
      const parsed = money(scaled, normalized);
      if (!isPositiveMoney(parsed)) continue;
      scaledBillAmounts.push(parsed.amount);
      scaledBillIds.push(billId);
      scaledTotal = addMoney(scaledTotal, parsed);
    }
    let rollup: RecognizedVendorBillRollup = {
      ...current,
      billAmounts: scaledBillAmounts,
      total: roundMoney(scaledTotal),
      billCount: scaledBillAmounts.length,
      recognizedBillIds: scaledBillIds,
      linkedExpenseDeductions: buildProjectLinkedExpenseDeductions(
        matchRows,
        projectId,
        weightsByExpenseId,
        normalized,
      ),
      billMatchLinks: projectScopedBillMatchLinks(
        scaledBillIds,
        linkedByBill,
        projectId,
        weightsByExpenseId,
        normalized,
      ),
    };
    if (splitTouchRows.length > 0) {
      const projectTouchRows = splitTouchRows.filter((row) =>
        splitExpenseTouchRowTouchesProject(row, projectId, splitExpenseWeights),
      );
      rollup = await augmentRollupWithSplitExpenseMatches(
        db,
        organizationId,
        projectId,
        normalized,
        rollup,
        billIdsWithAllocations,
        projectTouchRows,
      );
    }
    result.set(projectId, rollup);
  }

  return applyPartialMatchPolicyToRollupMap(db, organizationId, normalized, result);
}
