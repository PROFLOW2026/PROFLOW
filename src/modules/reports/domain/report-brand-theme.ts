import type { DocumentTheme } from '@/modules/branding';
import type { ReportKind } from './types';

/** Customer-facing report kinds use customer letterhead theme. */
const CUSTOMER_KINDS = new Set<ReportKind>([
  'quote_estimate',
  'change_order_summary',
  'boq_progress',
  'client_360',
  'field_daily',
  'punch_inspection',
  'purchase_order',
  'procurement_rfq',
  'customer_statement',
  'contract_summary',
  'work_order',
  'service_completion',
  'project_billing_account',
]);

export function reportBrandTheme(kind: ReportKind): DocumentTheme {
  return CUSTOMER_KINDS.has(kind) ? 'customer' : 'internal';
}
