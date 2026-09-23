export type VendorExpenseActivityKind = 'expense' | 'reversal' | 'adjustment';

export type VendorExpensePaymentDisplay =
  | 'paid'
  | 'overdue'
  | 'unpaid'
  | 'cancelled'
  | 'not_applicable';

export function resolveVendorExpenseActivityKind(input: {
  readonly voidsExpenseId: string | null;
  readonly adjustsExpenseId: string | null;
}): VendorExpenseActivityKind {
  if (input.voidsExpenseId) return 'reversal';
  if (input.adjustsExpenseId) return 'adjustment';
  return 'expense';
}

export function resolveVendorExpensePaymentDisplay(input: {
  readonly kind: VendorExpenseActivityKind;
  readonly hasActiveReversal: boolean;
  readonly grossAmount: string;
  readonly paymentStatus: string | null;
}): VendorExpensePaymentDisplay {
  if (input.kind === 'reversal') return 'cancelled';
  if (input.hasActiveReversal) return 'cancelled';
  if (Number(input.grossAmount) <= 0) return 'not_applicable';
  if (input.paymentStatus === 'paid') return 'paid';
  if (input.paymentStatus === 'overdue') return 'overdue';
  return 'unpaid';
}

export function vendorExpenseCountsTowardOutstanding(input: {
  readonly kind: VendorExpenseActivityKind;
  readonly hasActiveReversal: boolean;
  readonly grossAmount: string;
  readonly status: string;
}): boolean {
  if (input.status !== 'finalized') return false;
  if (input.kind === 'reversal') return false;
  if (input.hasActiveReversal) return false;
  return Number(input.grossAmount) > 0;
}

export function vendorExpenseCountsTowardPaid(input: {
  readonly kind: VendorExpenseActivityKind;
  readonly hasActiveReversal: boolean;
  readonly paymentStatus: string | null;
  readonly paidGrossAmount: string | null;
}): boolean {
  if (input.kind === 'reversal') return false;
  if (input.hasActiveReversal) return false;
  return input.paymentStatus === 'paid' && Boolean(input.paidGrossAmount);
}
