/**
 * Fold org-wide AP read facts using existing AP domain semantics (no duplicate formulas).
 */

import {
  addMoney,
  isPositiveMoney,
  isZeroMoney,
  roundMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { buildLinkedExpenseDeductions } from '@/modules/financials/domain/expense-ap-dedup';
import {
  areApBillProjectAllocationsAvailable,
  creditApplicationActualReduction,
  netProjectSliceAfterCredits,
} from '@/modules/ap';
import { resolveVendorBillProjectAmounts } from '../domain/vendor-bill-project-attribution';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '../domain/vendor-cost-recognition';
import {
  billNetForGeneralRemainder,
  sumVendorBillGeneralRemainders,
  type VendorBillGeneralRemainderBuckets,
  type VendorBillGeneralRemainderInput,
} from '../domain/vendor-general-remainder';
import type { ApCreditFactRow, ApOrgReadFactsBundle } from '../data/ap-read-facts.types';

function creditReductionAmounts(
  rows: readonly ApCreditFactRow[],
  apBillId: string,
): { amount: string; projectId: string | null }[] {
  return rows
    .filter((row) => row.apBillId === apBillId)
    .map((row) => {
      const creditNet = row.creditNet ?? row.appliedGross;
      const creditGross = row.creditGross ?? row.appliedGross;
      return {
        amount: creditApplicationActualReduction({
          currency: row.currency,
          appliedGross: row.appliedGross,
          creditNet,
          creditGross,
        }).amount,
        projectId: row.creditProjectId,
      };
    });
}

function creditActualReductionStrings(
  rows: readonly ApCreditFactRow[],
  apBillId: string,
): string[] {
  return creditReductionAmounts(rows, apBillId).map((row) => row.amount);
}

export function foldApGeneralRemaindersByYearMonthFromFacts(
  bundle: ApOrgReadFactsBundle,
  yearMonths: readonly string[],
  currency: string,
): Map<string, VendorBillGeneralRemainderBuckets> {
  const result = new Map<string, VendorBillGeneralRemainderBuckets>();
  if (yearMonths.length === 0) return result;

  const normalized = currency.toUpperCase();
  const allowed = new Set(yearMonths);
  const recognizedStatuses = new Set<string>([...RECOGNIZED_VENDOR_BILL_STATUSES]);
  const useAllocations = areApBillProjectAllocationsAvailable();

  const billRows = bundle.bills.filter(
    (row) =>
      recognizedStatuses.has(row.status) &&
      row.currency.toUpperCase() === normalized &&
      row.billDate != null &&
      allowed.has(String(row.billDate).slice(0, 7)),
  );

  if (billRows.length === 0) return result;

  const projectAmountsByBill = new Map<string, string[]>();
  const billsWithAnyApplied = new Set<string>();
  const billsWithProjectApplied = new Set<string>();

  for (const row of bundle.allocations) {
    if (row.status !== 'applied' || row.currency.toUpperCase() !== normalized) continue;
    billsWithAnyApplied.add(row.apBillId);
    if (row.targetType === 'project' && row.projectId) {
      billsWithProjectApplied.add(row.apBillId);
      const list = projectAmountsByBill.get(row.apBillId) ?? [];
      list.push(row.amount);
      projectAmountsByBill.set(row.apBillId, list);
    }
  }

  const byMonth = new Map<string, VendorBillGeneralRemainderInput[]>();
  for (const row of billRows) {
    const ym = String(row.billDate).slice(0, 7);
    const input: VendorBillGeneralRemainderInput = {
      currency: row.currency,
      projectId: row.projectId,
      billNetAmount: billNetForGeneralRemainder(row),
      creditActualReductions: creditActualReductionStrings(bundle.creditReductions, row.id),
      appliedProjectAllocationAmounts: useAllocations
        ? (projectAmountsByBill.get(row.id) ?? [])
        : [],
      hasAppliedAllocationLines: billsWithAnyApplied.has(row.id),
      hasAppliedProjectAllocationLines: billsWithProjectApplied.has(row.id),
    };
    const list = byMonth.get(ym) ?? [];
    list.push(input);
    byMonth.set(ym, list);
  }

  for (const [ym, inputs] of byMonth) {
    result.set(ym, sumVendorBillGeneralRemainders(inputs, normalized));
  }
  return result;
}

export type RecognizedVendorBillRollupLike = {
  readonly billAmounts: readonly string[];
  readonly total: MoneyValue;
  readonly linkedExpenseDeductions: ReadonlyMap<string, string>;
  readonly excludedForeignCurrencyCount: number;
  readonly billCount: number;
};

export function foldRecognizedVendorBillsForProjectsFromFacts(
  bundle: ApOrgReadFactsBundle,
  projectIds: readonly string[],
  currency: string,
): Map<string, RecognizedVendorBillRollupLike> {
  const result = new Map<string, RecognizedVendorBillRollupLike>();
  for (const projectId of projectIds) {
    result.set(
      projectId,
      foldRecognizedVendorBillsForProjectFromFacts(bundle, projectId, currency),
    );
  }
  return result;
}

export function foldRecognizedVendorBillsForProjectFromFacts(
  bundle: ApOrgReadFactsBundle,
  projectId: string,
  currency: string,
): RecognizedVendorBillRollupLike {
  const normalized = currency.toUpperCase();
  const recognizedStatuses = new Set<string>([...RECOGNIZED_VENDOR_BILL_STATUSES]);
  const useAllocations = areApBillProjectAllocationsAvailable();

  const billRows = bundle.bills.filter((row) => recognizedStatuses.has(row.status));
  const allocationLines = bundle.allocations
    .filter(
      (row) =>
        row.targetType === 'project' && row.projectId === projectId && row.status === 'applied',
    )
    .map((row) => ({
      billId: row.apBillId,
      projectId: row.projectId!,
      amount: row.amount,
      currency: row.currency,
    }));

  const billIdsWithAllocations = new Set(
    bundle.allocations
      .filter((row) => row.targetType === 'project' && row.projectId && row.status === 'applied')
      .map((row) => row.apBillId),
  );

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

  let total = zeroMoney(normalized);
  let excludedForeignCurrencyCount = 0;
  const billAmounts: string[] = [];
  const recognizedBillIds: string[] = [];
  const billNetById = new Map(billRows.map((row) => [row.id, row.netAmount ?? row.totalAmount]));

  for (const row of billRows) {
    if (row.currency.toUpperCase() === normalized) continue;
    if (row.projectId === projectId || (useAllocations && billIdsWithAllocations.has(row.id))) {
      excludedForeignCurrencyCount += 1;
    }
  }

  for (let i = 0; i < resolved.amounts.length; i += 1) {
    const amountStr = resolved.amounts[i]!;
    const billId = resolved.billIds[i]!;
    const billNet = billNetById.get(billId) ?? amountStr;
    const netted = netProjectSliceAfterCredits({
      currency: normalized,
      billNetAmount: billNet,
      sliceAmount: amountStr,
      creditActualReductions: creditReductionAmounts(bundle.creditReductions, billId),
      projectId,
    });
    if (isZeroMoney(netted) || !isPositiveMoney(netted)) continue;
    billAmounts.push(netted.amount);
    total = addMoney(total, netted);
    recognizedBillIds.push(billId);
  }

  const linkedExpenseDeductions =
    recognizedBillIds.length === 0
      ? new Map<string, string>()
      : buildLinkedExpenseDeductions(
          bundle.poMatches
            .filter((row) => recognizedBillIds.includes(row.apBillId))
            .map((row) => ({
              expenseId: row.expenseId,
              matchedAmount: row.matchedAmount,
              expenseCurrency: row.expenseCurrency,
            })),
          normalized,
        );

  return {
    billAmounts,
    total: roundMoney(total),
    linkedExpenseDeductions,
    excludedForeignCurrencyCount,
    billCount: billAmounts.length,
  };
}
