import { and, eq, inArray, isNotNull, isNull, notInArray, sql } from 'drizzle-orm';
import {
  apBillProjectAllocations,
  apBills,
  apPoMatches,
  expenseAllocations,
  expenses,
  vendors,
} from '@drizzle/schema';
import {
  areApBillProjectAllocationsAvailable,
  listActiveCreditActualReductionsForBills,
  resolveVendorBillProjectAmounts,
  scaleBillSliceAfterCredits,
} from '@/modules/ap';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
import type { DbExecutor } from '@/shared/db/types';
import {
  addMoney,
  fromNumericString,
  isPositiveMoney,
  isZeroMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';

export interface ProjectVendorActualRow {
  readonly vendorId: string;
  readonly vendorName: string;
  readonly actual: MoneyValue;
}

export async function loadProjectVendorActualBreakdown(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  currency: string,
): Promise<readonly ProjectVendorActualRow[]> {
  const normalized = currency.toUpperCase();
  const byVendor = new Map<string, { name: string; total: MoneyValue }>();

  const linkedExpenseIds = await loadLinkedExpenseIds(db, organizationId);
  const linkedList = [...linkedExpenseIds];

  const expenseFilters = [
    eq(expenses.organizationId, organizationId),
    eq(expenses.status, 'finalized'),
    isNull(expenses.archivedAt),
    isNotNull(expenses.vendorId),
    eq(expenses.currency, normalized),
  ];
  if (linkedList.length > 0) {
    expenseFilters.push(notInArray(expenses.id, linkedList));
  }

  const directExpenses = await db
    .select({
      vendorId: expenses.vendorId,
      vendorName: vendors.name,
      amount: expenses.netAmount,
      currency: expenses.currency,
    })
    .from(expenses)
    .innerJoin(vendors, eq(vendors.id, expenses.vendorId))
    .where(and(...expenseFilters, eq(expenses.projectId, projectId)));

  const allocatedExpenses = await db
    .select({
      vendorId: expenses.vendorId,
      vendorName: vendors.name,
      amount: expenseAllocations.amount,
      currency: expenseAllocations.currency,
    })
    .from(expenseAllocations)
    .innerJoin(expenses, eq(expenses.id, expenseAllocations.expenseId))
    .innerJoin(vendors, eq(vendors.id, expenses.vendorId))
    .where(
      and(
        eq(expenseAllocations.organizationId, organizationId),
        eq(expenseAllocations.projectId, projectId),
        eq(expenses.status, 'finalized'),
        isNull(expenses.archivedAt),
        isNotNull(expenses.vendorId),
        ...(linkedList.length > 0 ? [notInArray(expenses.id, linkedList)] : []),
      ),
    );

  for (const row of [...directExpenses, ...allocatedExpenses]) {
    if (!row.vendorId) continue;
    if (row.currency.toUpperCase() !== normalized) continue;
    const amount = fromNumericString(row.amount, row.currency);
    if (!amount) continue;
    const bucket = byVendor.get(row.vendorId) ?? {
      name: row.vendorName,
      total: zeroMoney(normalized),
    };
    byVendor.set(row.vendorId, {
      name: row.vendorName,
      total: addMoney(bucket.total, amount),
    });
  }

  const useAllocations = areApBillProjectAllocationsAvailable();
  const billRows = await db
    .select({
      id: apBills.id,
      vendorId: apBills.vendorId,
      vendorName: vendors.name,
      projectId: apBills.projectId,
      totalAmount: apBills.totalAmount,
      netAmount: apBills.netAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .innerJoin(vendors, eq(vendors.id, apBills.vendorId))
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

  const allocationLines: {
    billId: string;
    projectId: string;
    amount: string;
    currency: string;
  }[] = [];
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

  const billMeta = new Map(billRows.map((row) => [row.id, row]));
  const creditsByBill = await listActiveCreditActualReductionsForBills(
    db,
    organizationId,
    [...new Set(resolved.billIds)],
  );

  for (let i = 0; i < resolved.amounts.length; i += 1) {
    const amountStr = resolved.amounts[i]!;
    const billId = resolved.billIds[i]!;
    const bill = billMeta.get(billId);
    if (!bill?.vendorId) continue;
    const billNet = bill.netAmount ?? bill.totalAmount;
    const netted = scaleBillSliceAfterCredits({
      currency: normalized,
      billNetAmount: billNet,
      sliceAmount: amountStr,
      creditActualReductions: creditsByBill.get(billId) ?? [],
    });
    if (isZeroMoney(netted) || !isPositiveMoney(netted)) continue;
    const bucket = byVendor.get(bill.vendorId) ?? {
      name: bill.vendorName,
      total: zeroMoney(normalized),
    };
    byVendor.set(bill.vendorId, {
      name: bill.vendorName,
      total: addMoney(bucket.total, netted),
    });
  }

  return [...byVendor.entries()]
    .map(([vendorId, bucket]) => ({
      vendorId,
      vendorName: bucket.name,
      actual: roundMoney(bucket.total),
    }))
    .filter((row) => isPositiveMoney(row.actual))
    .sort((a, b) => b.actual.amount.localeCompare(a.actual.amount));
}

async function loadLinkedExpenseIds(
  db: DbExecutor,
  organizationId: string,
): Promise<Set<string>> {
  const rows = await db
    .select({ expenseId: apPoMatches.expenseId })
    .from(apPoMatches)
    .innerJoin(apBills, eq(apBills.id, apPoMatches.apBillId))
    .where(
      and(
        eq(apPoMatches.organizationId, organizationId),
        eq(apPoMatches.status, 'accepted'),
        isNotNull(apPoMatches.expenseId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
      ),
    );
  return new Set(rows.map((row) => row.expenseId).filter(Boolean) as string[]);
}
