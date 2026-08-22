import type { ReportKind } from './types';

export function reportDownloadPath(kind: ReportKind, id: string): string {
  const params = new URLSearchParams({ kind, id });
  return `/reports/download?${params.toString()}`;
}

export function reportPreviewPath(kind: ReportKind, id: string): string {
  const params = new URLSearchParams({ kind, id });
  return `/reports/preview?${params.toString()}`;
}

/** Professional English stem for download filenames (ASCII-safe prefix). */
const KIND_FILENAME_STEM: Record<ReportKind, string> = {
  project_status: 'Project-Status',
  project_financial_summary: 'Financial-Summary',
  boq_progress: 'BOQ-Progress',
  change_order_summary: 'Change-Order-Summary',
  quote_estimate: 'Quote',
  field_daily: 'Daily-Log',
  punch_inspection: 'Punch-Inspection',
  vendor_subcontract_summary: 'Vendor-Subcontract-Summary',
  client_360: 'Client-360',
  vendor_360: 'Vendor-360',
  contract_portfolio: 'Contract-Portfolio',
  subcontract_cash: 'Subcontract-Cash',
  labor_utilization: 'Labor-Utilization',
  retention_schedule: 'Retention-Schedule',
  inventory_movement: 'Inventory-Movement',
  compliance_expiry: 'Compliance-Expiry',
  crm_funnel: 'CRM-Funnel',
  month_close_completeness: 'Month-Close',
  safety_open_actions: 'Safety-Open-Actions',
  purchase_order: 'Purchase-Order',
  procurement_rfq: 'RFQ',
  customer_statement: 'Customer-Statement',
  contract_summary: 'Contract-Summary',
  work_order: 'Work-Order',
  service_completion: 'Service-Completion',
  timesheet: 'Timesheet',
  project_billing_account: 'Progress-Account',
  project_billing_plan_status: 'Billing-Plan-Status',
};

/**
 * Sanitizes a filename segment for Content-Disposition / downloads.
 * Keeps Hebrew and other letters; strips path separators and reserved chars.
 */
export function sanitizeFilenameSegment(value: string, maxLen = 48): string {
  const cleaned = value
    .normalize('NFC')
    .replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '-')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .trim();
  if (!cleaned) return '';
  return cleaned.slice(0, maxLen);
}

export interface ReportFilenameOptions {
  readonly projectName?: string | null;
  readonly projectNumber?: string | null;
  readonly documentLabel?: string | null;
  /** Override stem (e.g. Purchase-Order for future PO docs). */
  readonly stem?: string | null;
}

/**
 * Builds a professional download filename, e.g. `Quote-QT-100-2026-08-21.pdf`
 * or `Project-Status-פרויקט-חוף-2026-08-21.pdf`.
 */
export function reportFilename(
  kind: ReportKind,
  generatedAt: Date,
  options: ReportFilenameOptions = {},
): string {
  const day = generatedAt.toISOString().slice(0, 10);
  const stem = sanitizeFilenameSegment(options.stem ?? KIND_FILENAME_STEM[kind] ?? kind, 40);
  const parts = [stem];

  const number = sanitizeFilenameSegment(options.projectNumber ?? '', 32);
  if (number) parts.push(number);

  const label = sanitizeFilenameSegment(options.documentLabel ?? '', 40);
  const project = sanitizeFilenameSegment(options.projectName ?? '', 40);
  // Prefer explicit document label; else project name when no number, or as extra context.
  if (label && label !== number) {
    parts.push(label);
  } else if (project && project !== number) {
    parts.push(project);
  }

  parts.push(day);
  return `${parts.filter(Boolean).join('-')}.pdf`;
}

/** Optional helper for non-report commercial docs (quotes / POs) sharing the shell. */
export function commercialDocumentFilename(
  kind: 'Quote' | 'Purchase-Order' | 'Invoice' | 'Credit-Note',
  generatedAt: Date,
  options: { documentNumber?: string | null; partyName?: string | null } = {},
): string {
  return reportFilename('quote_estimate', generatedAt, {
    stem: kind,
    projectNumber: options.documentNumber,
    documentLabel: options.partyName,
  });
}
