/**
 * Vendor bill Actual attribution across projects.
 *
 * IF a bill has any ap_bill_project_allocations rows:
 *   project Actual uses those line amounts only (never also header project_id).
 * ELSE:
 *   project Actual uses full recognized bill total when header.project_id matches.
 *
 * Payment applications never enter this path.
 *
 * Persistence gate: 0021 applied; allocation lines slice recognized bill NET.
 * Payments never enter this path. Tests may override.
 */

/** Post-0021: bill project allocations live in financial attribution. */
export const AP_BILL_PROJECT_ALLOCATIONS_READY = true as boolean;

let allocationsReadyOverride: boolean | undefined;

function isTestRuntime(): boolean {
  return process.env.NODE_ENV === 'test' || process.env.VITEST === 'true';
}

export function setApBillProjectAllocationsReadyForTests(ready: boolean | undefined): void {
  if (!isTestRuntime()) {
    throw new Error('setApBillProjectAllocationsReadyForTests is test-only');
  }
  allocationsReadyOverride = ready;
}

export function areApBillProjectAllocationsAvailable(): boolean {
  if (allocationsReadyOverride !== undefined) return allocationsReadyOverride;
  if (
    isTestRuntime() &&
    (process.env.AP_BILL_PROJECT_ALLOCATIONS_READY === 'true' ||
      process.env.AP_BILL_PROJECT_ALLOCATIONS_READY === '1')
  ) {
    return true;
  }
  return AP_BILL_PROJECT_ALLOCATIONS_READY;
}

export interface VendorBillHeaderSlice {
  readonly billId: string;
  readonly projectId: string | null;
  readonly totalAmount: string;
  readonly currency: string;
}

export interface VendorBillAllocationSlice {
  readonly billId: string;
  readonly projectId: string;
  readonly amount: string;
  readonly currency: string;
}

/**
 * Pure rollup: amounts to attribute to `projectId` without double-counting
 * header + allocation lines.
 */
export function resolveVendorBillProjectAmounts(input: {
  readonly projectId: string;
  readonly currency: string;
  readonly headerBills: readonly VendorBillHeaderSlice[];
  readonly allocationLines: readonly VendorBillAllocationSlice[];
  /** Bill ids that have ≥1 allocation row (any project/overhead). */
  readonly billIdsWithAllocations: ReadonlySet<string>;
}): { readonly amounts: string[]; readonly billIds: string[] } {
  const normalized = input.currency.toUpperCase();
  const amounts: string[] = [];
  const billIds: string[] = [];

  for (const line of input.allocationLines) {
    if (line.projectId !== input.projectId) continue;
    if (line.currency.toUpperCase() !== normalized) continue;
    amounts.push(line.amount);
    billIds.push(line.billId);
  }

  for (const bill of input.headerBills) {
    if (bill.projectId !== input.projectId) continue;
    if (bill.currency.toUpperCase() !== normalized) continue;
    if (input.billIdsWithAllocations.has(bill.billId)) continue;
    amounts.push(bill.totalAmount);
    billIds.push(bill.billId);
  }

  return { amounts, billIds };
}
