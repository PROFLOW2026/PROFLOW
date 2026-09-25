/**
 * CLOSED BY DESIGN.
 * Contractor customer billing is billing plans and progress cycles.
 * `recurring_financial_drafts.draft_kind = billing_record` can still create one
 * management draft when the owner explicitly generates an occurrence. That path
 * stays draft-only and is not a subscription. It is not run by the expense
 * occurrence sync, so it does not race progress billing.
 */
export const CUSTOMER_RECURRING_BILLING_DECISION = 'closed_by_design' as const;

/** Kinds the occurrence sync may generate. Customer billing is not in this list. */
export const AUTO_GENERATED_DRAFT_KINDS = ['expense'] as const;
