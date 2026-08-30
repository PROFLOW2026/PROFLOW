/**
 * Fold bundled AP facts into existing Financials rollup shapes.
 */

import {
  areApBillProjectAllocationsAvailable,
  computeBillOutstanding,
  creditApplicationActualReduction,
  netProjectSliceAfterCredits,
  resolveVendorBillProjectAmounts,
  scaleBillOutstandingToProjectSlice,
} from '@/modules/ap';
import { RECOGNIZED_VENDOR_BILL_STATUSES } from '@/modules/ap/domain/vendor-cost-recognition';
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
import type {
  FinancialsApFactsBundle,
  ApCreditFactRow,
} from '../data/financials-read-bundle.repository';
import type { RecognizedVendorBillRollup } from '../data/committed-costs.repository';
import { buildLinkedExpenseDeductions } from '../domain/expense-ap-dedup';

const OPEN_AP_CASH_STATUSES = RECOGNIZED_VENDOR_BILL_STATUSES;

function creditReductionsFromFacts(
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

export function foldRecognizedVendorBillsFromApBundle(
  bundle: FinancialsApFactsBundle,
  projectId: string,
  currency: string,
): RecognizedVendorBillRollup {
  const normalized = currency.toUpperCase();
  const useAllocations = areApBillProjectAllocationsAvailable();
  const recognizedStatuses = new Set<string>([...RECOGNIZED_VENDOR_BILL_STATUSES]);

  const billRows = bundle.bills.filter((row) => recognizedStatuses.has(row.status));
  const allocationLines = bundle.allocations
    .filter((row) => row.targetType === 'project' && row.projectId === projectId)
    .map((row) => ({
      billId: row.apBillId,
      projectId: row.projectId!,
      amount: row.amount,
      currency: row.currency,
    }));

  const billIdsWithAllocations = new Set(
    bundle.allocations.filter((row) => row.targetType === 'project' && row.projectId).map((r) => r.apBillId),
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

  const billAmounts: string[] = [];
  let total = zeroMoney(normalized);
  let excludedForeignCurrencyCount = 0;
  const recognizedBillIds: string[] = [];

  for (const row of billRows) {
    if (row.currency.toUpperCase() === normalized) continue;
    if (row.projectId === projectId || (useAllocations && billIdsWithAllocations.has(row.id))) {
      excludedForeignCurrencyCount += 1;
    }
  }

  const billNetById = new Map(billRows.map((row) => [row.id, row.netAmount ?? row.totalAmount]));

  for (let i = 0; i < resolved.amounts.length; i += 1) {
    const amountStr = resolved.amounts[i]!;
    const billId = resolved.billIds[i]!;
    const billNet = billNetById.get(billId) ?? amountStr;
    const netted = netProjectSliceAfterCredits({
      currency: normalized,
      billNetAmount: billNet,
      sliceAmount: amountStr,
      creditActualReductions: creditReductionsFromFacts(bundle.creditReductions, billId),
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
            .flatMap((row) => [
              {
                expenseId: row.expenseId,
                matchedAmount: row.matchedAmount,
                expenseCurrency: row.expenseCurrency,
              },
            ]),
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

export function foldOpenApPayableFromApBundle(
  bundle: FinancialsApFactsBundle,
  projectId: string,
  currency: string,
): { total: MoneyValue; excludedForeignCurrencyCount: number; billCount: number } {
  const normalized = currency.toUpperCase();
  const openStatuses = new Set<string>([...OPEN_AP_CASH_STATUSES]);
  const useAllocations = areApBillProjectAllocationsAvailable();

  const billRows = bundle.bills.filter((row) => openStatuses.has(row.status));
  const paymentsByBill = new Map<string, string[]>();
  for (const pay of bundle.vendorPayments) {
    const list = paymentsByBill.get(pay.apBillId) ?? [];
    list.push(pay.amount);
    paymentsByBill.set(pay.apBillId, list);
  }

  const allocationLines = bundle.allocations.filter(
    (row) => row.targetType === 'project' && row.projectId === projectId,
  );

  let total = zeroMoney(normalized);
  let excludedForeignCurrencyCount = 0;
  let billCount = 0;
  const countedBills = new Set<string>();

  for (const row of billRows) {
    if (row.currency.toUpperCase() !== normalized) {
      excludedForeignCurrencyCount += 1;
      continue;
    }

    const billNet = row.netAmount ?? row.totalAmount;
    const credits = creditReductionsFromFacts(bundle.creditReductions, row.id);
    const outstanding = computeBillOutstanding({
      billStatus: row.status,
      billTotal: money(row.totalAmount, row.currency),
      applications: (paymentsByBill.get(row.id) ?? []).map((amount) => ({
        appliedAmount: money(amount, row.currency),
        paymentStatus: 'recorded' as const,
      })),
      creditApplications: credits.map((credit) => ({
        appliedAmount: money(credit.amount, row.currency),
        status: 'applied' as const,
      })),
      retentionHeldRemaining: money(row.retentionHeldRemaining, row.currency),
    });

    if (useAllocations) {
      const projectLines = allocationLines.filter((line) => line.apBillId === row.id);
      if (projectLines.length > 0) {
        for (const line of projectLines) {
          const sliceAmount = fromNumericString(line.amount, line.currency);
          if (!sliceAmount) continue;
          const sliceOutstanding = scaleBillOutstandingToProjectSlice({
            currency: normalized,
            billNetAmount: billNet,
            sliceAmount: sliceAmount.amount,
            billOutstanding: outstanding,
          });
          if (!isPositiveMoney(sliceOutstanding)) continue;
          total = addMoney(total, sliceOutstanding);
          if (!countedBills.has(row.id)) {
            countedBills.add(row.id);
            billCount += 1;
          }
        }
        continue;
      }
    }

    if (row.projectId !== projectId) continue;
    const netted = netProjectSliceAfterCredits({
      currency: normalized,
      billNetAmount: billNet,
      sliceAmount: billNet,
      creditActualReductions: credits,
      projectId,
    });
    const sliceOutstanding = scaleBillOutstandingToProjectSlice({
      currency: normalized,
      billNetAmount: billNet,
      sliceAmount: netted.amount,
      billOutstanding: outstanding,
    });
    if (!isPositiveMoney(sliceOutstanding)) continue;
    total = addMoney(total, sliceOutstanding);
    if (!countedBills.has(row.id)) {
      countedBills.add(row.id);
      billCount += 1;
    }
  }

  return { total: roundMoney(total), excludedForeignCurrencyCount, billCount };
}
