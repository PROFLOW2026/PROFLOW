import { and, eq, gte, inArray, isNotNull, isNull, lte } from 'drizzle-orm';
import { apBillProjectAllocations, apBills } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { ValidationError } from '@/shared/errors';
import { zeroMoney, type MoneyValue } from '@/shared/money';
import { listActiveCreditActualReductionsForBills } from './credits.repository';
import { areApBillProjectAllocationsAvailable } from '../domain/vendor-bill-project-attribution';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '../domain/vendor-cost-recognition';
import {
  billNetForGeneralRemainder,
  sumVendorBillGeneralRemainders,
  type VendorBillGeneralRemainderBuckets,
  type VendorBillGeneralRemainderInput,
} from '../domain/vendor-general-remainder';

const YEAR_MONTH_RE = /^([0-9]{4})-(0[1-9]|1[0-2])$/;

function yearMonthBillDateBounds(yearMonth: string): { startDate: string; endDate: string } {
  const trimmed = yearMonth.trim();
  if (!YEAR_MONTH_RE.test(trimmed)) {
    throw new ValidationError(
      [{ path: 'yearMonth', message: 'Expected YYYY-MM' }],
      'Invalid year-month',
    );
  }
  const [yearPart, monthPart] = trimmed.split('-');
  const lastDay = new Date(Date.UTC(Number(yearPart), Number(monthPart), 0)).getUTCDate();
  return {
    startDate: `${trimmed}-01`,
    endDate: `${trimmed}-${String(lastDay).padStart(2, '0')}`,
  };
}

function emptyBuckets(currency: string): VendorBillGeneralRemainderBuckets {
  const zero = zeroMoney(currency.toUpperCase());
  return {
    remainderFromUnderAllocatedBills: zero,
    remainderFromNullProjectBills: zero,
    totalGeneralRemainder: zero,
  };
}

/**
 * Batch-load recognized AP general remainder for Company Actual.
 *
 * Excludes draft/void. Optional `yearMonth` filters `bill_date` (inclusive).
 * No N+1: bills, applied allocations, and credit reductions are each one query.
 */
export async function sumRecognizedApGeneralRemainders(
  db: DbExecutor,
  organizationId: string,
  currency: string,
  yearMonth?: string,
): Promise<VendorBillGeneralRemainderBuckets> {
  const normalized = currency.toUpperCase();
  const dateBounds = yearMonth ? yearMonthBillDateBounds(yearMonth) : null;

  const billRows = await db
    .select({
      id: apBills.id,
      projectId: apBills.projectId,
      netAmount: apBills.netAmount,
      totalAmount: apBills.totalAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(
      and(
        eq(apBills.organizationId, organizationId),
        inArray(apBills.status, [...RECOGNIZED_VENDOR_BILL_STATUSES]),
        isNull(apBills.archivedAt),
        eq(apBills.currency, normalized),
        ...(dateBounds
          ? [
              isNotNull(apBills.billDate),
              gte(apBills.billDate, dateBounds.startDate),
              lte(apBills.billDate, dateBounds.endDate),
            ]
          : []),
      ),
    );

  if (billRows.length === 0) return emptyBuckets(normalized);

  const useAllocations = areApBillProjectAllocationsAvailable();
  const projectAmountsByBill = new Map<string, string[]>();
  const billsWithAnyApplied = new Set<string>();
  const billsWithProjectApplied = new Set<string>();

  if (useAllocations) {
    const allocationRows = await db
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
          inArray(
            apBillProjectAllocations.apBillId,
            billRows.map((row) => row.id),
          ),
          eq(apBillProjectAllocations.status, 'applied'),
        ),
      );

    for (const row of allocationRows) {
      if (row.currency.toUpperCase() !== normalized) continue;
      billsWithAnyApplied.add(row.apBillId);
      if (row.targetType === 'project' && row.projectId) {
        billsWithProjectApplied.add(row.apBillId);
        const list = projectAmountsByBill.get(row.apBillId) ?? [];
        list.push(row.amount);
        projectAmountsByBill.set(row.apBillId, list);
      }
    }
  }

  const creditsByBill = await listActiveCreditActualReductionsForBills(
    db,
    organizationId,
    billRows.map((row) => row.id),
  );

  const inputs: VendorBillGeneralRemainderInput[] = billRows.map((row) => {
    const hasAppliedAllocationLines = billsWithAnyApplied.has(row.id);
    const hasAppliedProjectAllocationLines = billsWithProjectApplied.has(row.id);
    return {
      currency: row.currency,
      projectId: row.projectId,
      billNetAmount: billNetForGeneralRemainder(row),
      creditActualReductions: creditsByBill.get(row.id) ?? [],
      appliedProjectAllocationAmounts: projectAmountsByBill.get(row.id) ?? [],
      hasAppliedAllocationLines,
      hasAppliedProjectAllocationLines,
    };
  });

  return sumVendorBillGeneralRemainders(inputs, normalized);
}

export type { VendorBillGeneralRemainderBuckets };
export type ApGeneralRemainderTotals = {
  readonly remainderFromUnderAllocatedBills: MoneyValue;
  readonly remainderFromNullProjectBills: MoneyValue;
  readonly totalGeneralRemainder: MoneyValue;
};
