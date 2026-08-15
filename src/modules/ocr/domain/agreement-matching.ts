/**
 * Suggest a subcontract agreement from vendor + project + currency.
 * Advisory only. Confirm still creates a draft bill/expense.
 */

export interface SubcontractSuggestionRow {
  readonly subcontractAgreementId: string;
  readonly title: string;
  readonly subcontractNumber: string | null;
  readonly projectId: string;
  readonly strength: 'vendor_project_currency' | 'vendor_project';
}

export interface SubcontractMatchProbe {
  readonly vendorId: string | null;
  readonly projectId: string | null;
  readonly currency: string | null;
}

export interface SubcontractIndexRow {
  readonly id: string;
  readonly vendorId: string;
  readonly projectId: string;
  readonly title: string;
  readonly subcontractNumber: string | null;
  readonly currency: string;
  readonly status: string;
}

export function suggestSubcontracts(
  probe: SubcontractMatchProbe,
  rows: readonly SubcontractIndexRow[],
): SubcontractSuggestionRow[] {
  if (!probe.vendorId || !probe.projectId) return [];
  const active = rows.filter(
    (row) =>
      row.vendorId === probe.vendorId &&
      row.projectId === probe.projectId &&
      (row.status === 'active' || row.status === 'draft'),
  );
  const exact = probe.currency
    ? active.filter((row) => row.currency.toUpperCase() === probe.currency!.toUpperCase())
    : [];
  const chosen = exact.length > 0 ? exact : active;
  return chosen.slice(0, 5).map((row) => ({
    subcontractAgreementId: row.id,
    title: row.title,
    subcontractNumber: row.subcontractNumber,
    projectId: row.projectId,
    strength: exact.length > 0 ? 'vendor_project_currency' : 'vendor_project',
  }));
}
