/**
 * Supplier-cost guidance.
 *
 * Expenses have no invoice-number column. When a user types a reference, the
 * expense description is the stored stand-in compared to `ap_bills.reference`.
 * Linking still happens through an accepted `ap_po_matches.expense_id` row.
 * This helper only decides what to show; it does not create or block a save.
 */

export function normalizeSupplierReference(value: string | null | undefined): string {
  return (value ?? '').trim().replace(/\s+/g, ' ').toLocaleLowerCase();
}

/** `/procurement/ap/new` reads `vendorId` and `projectId` query params. */
export function buildVendorBillCreateHref(input: {
  readonly vendorId?: string | null;
  readonly projectId?: string | null;
}): string {
  const params = new URLSearchParams();
  const vendorId = input.vendorId?.trim() ?? '';
  const projectId = input.projectId?.trim() ?? '';
  if (vendorId) params.set('vendorId', vendorId);
  if (projectId) params.set('projectId', projectId);
  const query = params.toString();
  return query ? `/procurement/ap/new?${query}` : '/procurement/ap/new';
}

export interface SupplierBillReferenceRow {
  readonly id: string;
  readonly vendorId: string;
  readonly reference: string | null;
  readonly status: string;
}

export function findNonVoidBillsForVendorReference<T extends SupplierBillReferenceRow>(
  probe: {
    readonly vendorId?: string | null;
    readonly reference?: string | null;
  },
  bills: readonly T[],
): readonly T[] {
  const vendorId = probe.vendorId?.trim() ?? '';
  const reference = normalizeSupplierReference(probe.reference);
  if (!vendorId || !reference) return [];

  return bills.filter((bill) => {
    if (bill.vendorId !== vendorId) return false;
    if (bill.status === 'void') return false;
    return normalizeSupplierReference(bill.reference) === reference;
  });
}

export interface SupplierExpenseReferenceRow {
  readonly id: string;
  readonly vendorId: string | null;
  readonly description: string | null;
  /** When set, only finalized rows match. Omitted means the caller already filtered. */
  readonly status?: string | null;
}

export function findExpensesForVendorReference<T extends SupplierExpenseReferenceRow>(
  probe: {
    readonly vendorId?: string | null;
    readonly reference?: string | null;
  },
  expenses: readonly T[],
): readonly T[] {
  const vendorId = probe.vendorId?.trim() ?? '';
  const reference = normalizeSupplierReference(probe.reference);
  if (!vendorId || !reference) return [];

  return expenses.filter((expense) => {
    if (expense.vendorId !== vendorId) return false;
    if (expense.status != null && expense.status !== 'finalized') return false;
    return normalizeSupplierReference(expense.description) === reference;
  });
}
