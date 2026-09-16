import type { ReportKind } from '@/modules/reports';

/** Report kinds that support "שמור באחסון" through the generated-documents service. */
export const GENERATED_STORAGE_REPORT_KINDS = [
  'quote_estimate',
  'customer_statement',
  'purchase_order',
  'contract_summary',
  'procurement_rfq',
  'timesheet',
  'monthly_workforce_report',
] as const satisfies readonly ReportKind[];

export type GeneratedStorageReportKind = (typeof GENERATED_STORAGE_REPORT_KINDS)[number];

export function supportsGeneratedStorageSave(kind: ReportKind): kind is GeneratedStorageReportKind {
  return (GENERATED_STORAGE_REPORT_KINDS as readonly string[]).includes(kind);
}
