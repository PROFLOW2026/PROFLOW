import { sanitizeFilenameSegment } from '@/modules/reports';
import type { ReportKind } from '@/modules/reports';

/** Provider-safe PDF names for generated business artifacts (Hebrew where useful). */
export function buildGeneratedPdfFileName(input: {
  readonly kind: ReportKind;
  readonly version: number;
  readonly reportMonth?: string | null;
  readonly documentNumber?: string | null;
  readonly partyName?: string | null;
  readonly projectName?: string | null;
}): string {
  const versionSuffix = input.version > 1 ? ` - גרסה ${input.version}` : '';

  if (input.kind === 'monthly_workforce_report' && input.reportMonth) {
    const base = `דוח עובדים - ${input.reportMonth}`;
    return `${sanitizeFilenameSegment(base, 80) || 'monthly-workforce'}${versionSuffix}.pdf`;
  }

  const stems: Partial<Record<ReportKind, string>> = {
    quote_estimate: 'הצעת מחיר',
    customer_statement: 'חיוב',
    purchase_order: 'הזמנת רכש',
    contract_summary: 'חוזה',
    procurement_rfq: 'בקשת הצעת מחיר',
    timesheet: 'גיליון שעות',
    work_order: 'קריאת שירות',
    service_completion: 'דוח שירות',
    project_billing_account: 'חשבון התקדמות',
    project_billing_plan_status: 'סטטוס חיוב',
  };

  const stem = stems[input.kind] ?? 'מסמך';
  const parts = [stem];
  const number = sanitizeFilenameSegment(input.documentNumber ?? '', 32);
  if (number) parts.push(number);
  const party = sanitizeFilenameSegment(input.partyName ?? input.projectName ?? '', 40);
  if (party && party !== number) parts.push(party);

  const joined = parts.filter(Boolean).join(' - ');
  return `${sanitizeFilenameSegment(joined, 100) || 'document'}${versionSuffix}.pdf`;
}
