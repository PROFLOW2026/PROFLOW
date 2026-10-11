import { and, eq, inArray, isNotNull, isNull, sql } from 'drizzle-orm';
import {
  apBillProjectAllocations,
  apBills,
  vendors,
} from '@drizzle/schema';
import { areApBillProjectAllocationsAvailable } from '@/modules/ap';
import { apBillNotStockPurchaseSql } from '@/modules/ap/domain/inventory-stock-purchase';
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
import { applyLinkedExpenseDeductionsToContributions } from '../domain/expense-ap-dedup';
import { loadProjectExpenseContributions } from './expenses.repository';
import { loadRecognizedVendorBillsForProject } from './committed-costs.repository';

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

  const [rollup, contributions] = await Promise.all([
    loadRecognizedVendorBillsForProject(db, organizationId, projectId, normalized),
    loadProjectExpenseContributions(db, organizationId, projectId),
  ]);

  const expensesForActual = applyLinkedExpenseDeductionsToContributions(
    contributions,
    rollup.linkedExpenseDeductions,
  );

  for (const line of expensesForActual) {
    if (!line.vendorId) continue;
    if (line.currency.toUpperCase() !== normalized) continue;
    const amount = fromNumericString(line.amount, line.currency);
    if (!amount || isZeroMoney(amount)) continue;
    const bucket = byVendor.get(line.vendorId) ?? {
      name: line.vendorName ?? '',
      total: zeroMoney(normalized),
    };
    byVendor.set(line.vendorId, {
      name: line.vendorName ?? bucket.name,
      total: addMoney(bucket.total, amount),
    });
  }

  if (rollup.recognizedBillIds.length === 0) {
    return [...byVendor.entries()]
      .map(([vendorId, bucket]) => ({
        vendorId,
        vendorName: bucket.name,
        actual: roundMoney(bucket.total),
      }))
      .filter((row) => isPositiveMoney(row.actual))
      .sort((a, b) => b.actual.amount.localeCompare(a.actual.amount));
  }

  const useAllocations = areApBillProjectAllocationsAvailable();
  const billRows = await db
    .select({
      id: apBills.id,
      vendorId: apBills.vendorId,
      vendorName: vendors.name,
    })
    .from(apBills)
    .innerJoin(vendors, eq(vendors.id, apBills.vendorId))
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.id, [...rollup.recognizedBillIds]),
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

  const billMeta = new Map(billRows.map((row) => [row.id, row]));

  for (let i = 0; i < rollup.billAmounts.length; i += 1) {
    const billId = rollup.recognizedBillIds[i];
    const amountStr = rollup.billAmounts[i];
    if (!billId || !amountStr) continue;
    const bill = billMeta.get(billId);
    if (!bill?.vendorId) continue;
    const amount = fromNumericString(amountStr, normalized);
    if (!amount || isZeroMoney(amount) || !isPositiveMoney(amount)) continue;
    const bucket = byVendor.get(bill.vendorId) ?? {
      name: bill.vendorName,
      total: zeroMoney(normalized),
    };
    byVendor.set(bill.vendorId, {
      name: bill.vendorName,
      total: addMoney(bucket.total, amount),
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
