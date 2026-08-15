import type { Locale } from '@/shared/i18n/config';
import type { PermissionKey } from '@/shared/permissions/catalog';

export const REPORT_KINDS = [
  'project_status',
  'project_financial_summary',
  'boq_progress',
  'change_order_summary',
  'quote_estimate',
  'field_daily',
  'punch_inspection',
  'vendor_subcontract_summary',
] as const;

export type ReportKind = (typeof REPORT_KINDS)[number];

export type ReportMetricNature =
  | 'actual'
  | 'committed'
  | 'forecast'
  | 'commercial'
  | 'estimate'
  | 'cash';

export interface ReportIdentity {
  readonly companyName: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly projectNumber: string | null;
  readonly clientName: string | null;
  readonly extra?: string | null;
}

export interface ReportRow {
  readonly label: string;
  readonly value: string;
  readonly nature?: ReportMetricNature;
}

export interface ReportTable {
  readonly headers: readonly string[];
  readonly rows: readonly (readonly string[])[];
}

export interface ReportSection {
  readonly id: string;
  readonly heading: string;
  readonly rows?: readonly ReportRow[];
  readonly tables?: readonly ReportTable[];
  readonly paragraphs?: readonly string[];
}

export interface ReportOmitted {
  readonly profit?: boolean;
  readonly compensation?: boolean;
  readonly commercial?: boolean;
}

export interface ReportPayload {
  readonly kind: ReportKind;
  readonly title: string;
  readonly generatedAt: string;
  readonly locale: Locale;
  readonly dir: 'rtl' | 'ltr';
  readonly identity: ReportIdentity;
  readonly notices: readonly string[];
  readonly sections: readonly ReportSection[];
  readonly omitted: ReportOmitted;
}

export interface GenerateReportInput {
  readonly kind: string;
  readonly id: string;
  readonly locale?: string | null;
}

export interface ReportPackOption {
  readonly id: string;
  readonly label: string;
}

export interface ReportKindDefinition {
  readonly kind: ReportKind;
  readonly permission: PermissionKey;
  readonly projectScoped: boolean;
}

export const DOCUMENT_NAME_CAP = 40;
