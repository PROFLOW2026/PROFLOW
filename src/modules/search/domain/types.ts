/**
 * Permission-safe global search domain types.
 * Results never include Actual / profit / employee cost / overhead / OCR content.
 * Amounts appear only when the same permission already allows them on the entity page.
 */

export const GLOBAL_SEARCH_KINDS = [
  'project',
  'job',
  'work_order',
  'client',
  'contact',
  'employee',
  'vendor',
  'bill',
  'vendor_credit',
  'billing',
  'expense',
  'quote',
  'opportunity',
  'contract',
  'purchase_order',
  'subcontract',
  'document',
  'asset',
  'inventory_item',
  'material',
  'boq_item',
  'daily_log',
  'punch',
  'inspection',
  'safety',
  'warranty',
  'communication',
  'calendar_event',
  'closeout',
  'billing_plan',
  'billing_cycle',
  'recurring_draft',
  'approval',
] as const;

export type GlobalSearchKind = (typeof GLOBAL_SEARCH_KINDS)[number];

export interface GlobalSearchHit {
  readonly kind: GlobalSearchKind;
  readonly id: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly href: string;
  readonly status?: string | null;
  readonly contextLabel?: string | null;
  readonly date?: string | null;
  readonly amount?: string | null;
  readonly currency?: string | null;
}

export interface GlobalSearchGroup {
  readonly kind: GlobalSearchKind;
  readonly hits: readonly GlobalSearchHit[];
}

export interface SearchCommandHit {
  readonly id: string;
  readonly titleKey: string;
  readonly href: string;
}

export interface GlobalSearchResult {
  readonly query: string;
  readonly commands: readonly SearchCommandHit[];
  readonly groups: readonly GlobalSearchGroup[];
  readonly hits: readonly GlobalSearchHit[];
}
