/**
 * Completeness predicates for AP bills.
 * SQL in completeness.repository.ts must stay aligned with these thresholds.
 */

/** Allocation completeness uses NET (ex-VAT), falling back to total. */
export function billCompletenessAllocationBasis(
  netAmount: string | null | undefined,
  totalAmount: string,
): number {
  return Number(netAmount ?? totalAmount);
}

/** True when applied allocations are short of the bill NET (or total fallback). */
export function isVendorBillUnallocatedForCompleteness(
  netAmount: string | null | undefined,
  totalAmount: string,
  appliedAllocationSum: number,
): boolean {
  return (
    billCompletenessAllocationBasis(netAmount, totalAmount) - appliedAllocationSum > 0.000001
  );
}

/**
 * Amount-shape anomalies only. `partially_matched` is a valid recognized
 * status and is not an anomaly by itself.
 */
export function isApBillAnomalyForCompleteness(input: {
  readonly status: string;
  readonly totalAmount: string;
  readonly lineSum: number;
  readonly netAmount?: string | null;
  readonly allocationSum?: number;
}): boolean {
  if (input.status === 'void') return false;
  const totalDiffersFromLines = Math.abs(Number(input.totalAmount) - input.lineSum) > 0.01;
  const overAllocated =
    (input.allocationSum ?? 0) >
    billCompletenessAllocationBasis(input.netAmount, input.totalAmount) + 0.000001;
  return totalDiffersFromLines || overAllocated;
}
