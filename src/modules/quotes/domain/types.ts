/**
 * Pre-sale Quotes / Estimates - Quote ≠ Billing ≠ Change Order ≠ Revenue.
 */

import { AUDIT_ACTIONS } from '@/shared/audit/actions';

export const QUOTE_STATUSES = [
  'draft',
  'ready',
  'sent',
  'accepted',
  'rejected',
  'expired',
  'cancelled',
  'converted',
] as const;

export type QuoteStatus = (typeof QUOTE_STATUSES)[number];

export const QUOTE_TAX_MODES = ['exclusive', 'inclusive', 'none'] as const;
export type QuoteTaxMode = (typeof QUOTE_TAX_MODES)[number];

/** Convert creates a work entity via existing project / service APIs. */
export const QUOTE_CONVERT_WORK_KINDS = ['project', 'job', 'work_order'] as const;
export type QuoteConvertWorkKind = (typeof QUOTE_CONVERT_WORK_KINDS)[number];

export interface QuoteLineItemRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly quoteId: string;
  readonly sortOrder: number;
  readonly description: string;
  readonly quantity: string;
  readonly unit: string | null;
  readonly unitPriceAmount: string;
  readonly estimatedUnitCostAmount: string | null;
  readonly lineTotalAmount: string | null;
  readonly notes: string | null;
}

export interface QuoteRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly clientId: string | null;
  readonly contactId: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly status: QuoteStatus;
  readonly currency: string;
  readonly taxMode: QuoteTaxMode;
  readonly taxRuleId: string | null;
  readonly validityDate: string | null;
  readonly notes: string | null;
  readonly subtotalAmount: string | null;
  readonly taxAmount: string | null;
  readonly totalAmount: string | null;
  readonly estimatedCostAmount: string | null;
  readonly estimatedMarginPercent: string | null;
  /** Customer discount (money). Stored on `estimates.discount_amount`. */
  readonly discountAmount: string | null;
  /** Catalogue net before discount. Stored on `estimates.list_subtotal_amount`. */
  readonly listSubtotalAmount: string | null;
  /** Discount percent when no money discount is stored. */
  readonly discountPercent: string | null;
  readonly convertedProjectId: string | null;
  /** Optional CRM opportunity. Convert-won uses this row, not crm_sales_quotes. */
  readonly opportunityId: string | null;
  readonly convertedAt: Date | null;
  readonly sentAt: Date | null;
  readonly decidedAt: Date | null;
  readonly createdByUserId: string | null;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface QuoteDetail extends QuoteRecord {
  readonly lines: readonly QuoteLineItemRecord[];
  readonly clientName: string | null;
}

export interface QuoteListItem {
  readonly id: string;
  readonly title: string;
  readonly status: QuoteStatus;
  readonly currency: string;
  readonly totalAmount: string | null;
  readonly clientId: string | null;
  readonly clientName: string | null;
  readonly validityDate: string | null;
  readonly updatedAt: Date;
  readonly convertedProjectId: string | null;
}

export const QUOTES_AUDIT_ACTIONS = {
  CREATED: AUDIT_ACTIONS.ESTIMATE_QUOTE_CREATED,
  UPDATED: AUDIT_ACTIONS.ESTIMATE_QUOTE_UPDATED,
  STATUS_CHANGED: AUDIT_ACTIONS.ESTIMATE_QUOTE_STATUS_CHANGED,
  CONVERTED: AUDIT_ACTIONS.ESTIMATE_QUOTE_CONVERTED,
} as const;
