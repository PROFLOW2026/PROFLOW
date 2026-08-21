/**
 * Payment term inheritance (create / defaulting only).
 *
 * Stored due dates and explicit term ids on posted documents are never rewritten
 * when catalog masters or org defaults change.
 */

/**
 * AR precedence: billing explicit → contract → client default → organization default.
 */
export function resolveArPaymentTermId(input: {
  readonly explicitId?: string | null;
  readonly contractTermId?: string | null;
  readonly clientDefaultId?: string | null;
  readonly orgDefaultId?: string | null;
}): string | null {
  return (
    input.explicitId ??
    input.contractTermId ??
    input.clientDefaultId ??
    input.orgDefaultId ??
    null
  );
}

/**
 * AP precedence: bill explicit → subcontract (when linked) → PO (when linked) →
 * vendor default → organization default.
 *
 * When both subcontract and PO are linked, subcontract wins — the subcontract
 * agreement is the commercial commitment; the PO is operational procurement.
 */
export function resolveApPaymentTermId(input: {
  readonly explicitId?: string | null;
  readonly subcontractTermId?: string | null;
  readonly purchaseOrderTermId?: string | null;
  readonly vendorDefaultId?: string | null;
  readonly orgDefaultId?: string | null;
}): string | null {
  return (
    input.explicitId ??
    input.subcontractTermId ??
    input.purchaseOrderTermId ??
    input.vendorDefaultId ??
    input.orgDefaultId ??
    null
  );
}

/**
 * Document / party default precedence: explicit → party default (client or vendor) → org default.
 * Used for contracts, subcontracts, POs, and party create when term is unset.
 */
export function resolveDocumentPaymentTermId(input: {
  readonly explicitId?: string | null;
  readonly partyDefaultId?: string | null;
  readonly orgDefaultId?: string | null;
}): string | null {
  return input.explicitId ?? input.partyDefaultId ?? input.orgDefaultId ?? null;
}

/** @deprecated Use resolveDocumentPaymentTermId or side-specific resolvers. */
export function resolveInheritedPaymentTermId(input: {
  readonly selectedId?: string | null;
  readonly partyDefaultId?: string | null;
  readonly orgDefaultId?: string | null;
}): string | null {
  return resolveDocumentPaymentTermId({
    explicitId: input.selectedId,
    partyDefaultId: input.partyDefaultId,
    orgDefaultId: input.orgDefaultId,
  });
}
