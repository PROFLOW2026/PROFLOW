/**
 * Vendor bill amounts that do not enter Project Actual today:
 *   1. Under-NET remainder after applied project allocation lines
 *   2. Recognized bills with null header project_id and no applied lines
 *
 * Attribution (`resolveVendorBillProjectAmounts`) never folds these into a project.
 * Company Actual must add them as general recognized cost.
 *
 * Payments never enter this path. Credits reduce bill NET first, then slices.
 */

import {
  addMoney,
  compareMoney,
  roundMoney,
  subtractMoney,
  sumMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import { vendorBillActualAmount } from './bill-tax';
import { netRecognizedBillAfterCredits, scaleBillSliceAfterCredits } from './vendor-credits';

export type VendorBillGeneralRemainderKind = 'under_allocated' | 'null_project' | 'none';

export interface VendorBillGeneralRemainderBuckets {
  readonly remainderFromUnderAllocatedBills: MoneyValue;
  readonly remainderFromNullProjectBills: MoneyValue;
  readonly totalGeneralRemainder: MoneyValue;
}

/**
 * Classify one recognized bill for the general-remainder buckets.
 *
 * - Applied **project** lines → under-allocated (NET − Σ project lines).
 * - Applied lines with no project target (overhead-only) → same bucket with
 *   zero project sum so the bill does not vanish (remainder covers under-NET).
 * - Null `projectId` and no applied lines → full NET.
 * - Header project and no applied lines → none (full NET is Project Actual).
 */
export function classifyVendorBillGeneralRemainder(input: {
  readonly projectId: string | null;
  readonly hasAppliedAllocationLines: boolean;
  readonly hasAppliedProjectAllocationLines: boolean;
}): VendorBillGeneralRemainderKind {
  if (input.hasAppliedProjectAllocationLines || input.hasAppliedAllocationLines) {
    return 'under_allocated';
  }
  if (input.projectId == null) return 'null_project';
  return 'none';
}

/** Remainder for one recognized bill after credits. Clamps below zero. */
export function vendorBillGeneralRemainderAmount(input: {
  readonly currency: string;
  readonly billNetAmount: string;
  readonly creditActualReductions?: readonly string[];
  readonly appliedProjectAllocationAmounts: readonly string[];
  readonly kind: VendorBillGeneralRemainderKind;
}): MoneyValue {
  const currency = input.currency.toUpperCase();
  if (input.kind === 'none') return zeroMoney(currency);

  const reductions = input.creditActualReductions ?? [];
  const netAfterCredits = netRecognizedBillAfterCredits({
    currency,
    billNetAmount: input.billNetAmount,
    creditActualReductions: reductions,
  });

  if (input.kind === 'null_project') return netAfterCredits;

  const allocatedSlices = input.appliedProjectAllocationAmounts.map((sliceAmount) =>
    scaleBillSliceAfterCredits({
      currency,
      billNetAmount: input.billNetAmount,
      sliceAmount,
      creditActualReductions: reductions,
    }),
  );
  const allocated =
    allocatedSlices.length === 0
      ? zeroMoney(currency)
      : sumMoney(allocatedSlices, currency);
  const remainder = subtractMoney(netAfterCredits, allocated);
  if (compareMoney(remainder, zeroMoney(currency)) < 0) {
    return zeroMoney(currency);
  }
  return remainder;
}

export interface VendorBillGeneralRemainderInput {
  readonly currency: string;
  readonly projectId: string | null;
  readonly billNetAmount: string;
  readonly creditActualReductions?: readonly string[];
  readonly appliedProjectAllocationAmounts: readonly string[];
  readonly hasAppliedAllocationLines: boolean;
  readonly hasAppliedProjectAllocationLines: boolean;
}

export function splitVendorBillGeneralRemainder(
  input: VendorBillGeneralRemainderInput,
): {
  readonly kind: VendorBillGeneralRemainderKind;
  readonly remainder: MoneyValue;
} {
  const kind = classifyVendorBillGeneralRemainder(input);
  return {
    kind,
    remainder: vendorBillGeneralRemainderAmount({
      currency: input.currency,
      billNetAmount: input.billNetAmount,
      creditActualReductions: input.creditActualReductions,
      appliedProjectAllocationAmounts: input.appliedProjectAllocationAmounts,
      kind,
    }),
  };
}

export function sumVendorBillGeneralRemainders(
  bills: readonly VendorBillGeneralRemainderInput[],
  currency: string,
): VendorBillGeneralRemainderBuckets {
  const code = currency.toUpperCase();
  let under = zeroMoney(code);
  let nullProject = zeroMoney(code);

  for (const bill of bills) {
    if (bill.currency.toUpperCase() !== code) continue;
    const { kind, remainder } = splitVendorBillGeneralRemainder(bill);
    if (kind === 'under_allocated') under = addMoney(under, remainder);
    else if (kind === 'null_project') nullProject = addMoney(nullProject, remainder);
  }

  const remainderFromUnderAllocatedBills = roundMoney(under);
  const remainderFromNullProjectBills = roundMoney(nullProject);
  return {
    remainderFromUnderAllocatedBills,
    remainderFromNullProjectBills,
    totalGeneralRemainder: roundMoney(
      addMoney(remainderFromUnderAllocatedBills, remainderFromNullProjectBills),
    ),
  };
}

export function billNetForGeneralRemainder(bill: {
  readonly netAmount?: string | null;
  readonly totalAmount: string;
}): string {
  return vendorBillActualAmount(bill);
}
