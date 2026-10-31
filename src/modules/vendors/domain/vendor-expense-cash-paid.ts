import type { VendorExpenseActivityKind } from './vendor-expense-activity-display';
import { vendorExpenseCountsTowardPaid } from './vendor-expense-activity-display';

export interface VendorExpenseCashPaidInput {
  readonly kind: VendorExpenseActivityKind;
  readonly hasActiveReversal: boolean;
  readonly paymentStatus: string | null;
  readonly paidGrossAmount: string | null;
  readonly netAmount: string;
  readonly grossAmount: string;
  readonly installmentPaidGross: number;
  readonly installmentPaidNet: number;
}

/** Cash paid per expense — installments win over header (no double count). */
export function resolveVendorExpenseCashPaid(input: VendorExpenseCashPaidInput): {
  readonly gross: number;
  readonly net: number;
} {
  const counts = vendorExpenseCountsTowardPaid({
    kind: input.kind,
    hasActiveReversal: input.hasActiveReversal,
    paymentStatus: input.paymentStatus,
    paidGrossAmount: input.paidGrossAmount,
  });
  if (!counts) {
    return { gross: 0, net: 0 };
  }
  if (input.installmentPaidGross > 0) {
    return { gross: input.installmentPaidGross, net: input.installmentPaidNet };
  }
  if (input.paymentStatus === 'paid' && input.paidGrossAmount) {
    const gross = Number(input.paidGrossAmount);
    const netTotal = Number(input.netAmount);
    const grossTotal = Number(input.grossAmount);
    const net =
      grossTotal > 0 && netTotal > 0 ? (gross / grossTotal) * netTotal : netTotal;
    return { gross, net };
  }
  return { gross: 0, net: 0 };
}
