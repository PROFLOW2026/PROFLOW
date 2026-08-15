import { normalizeVendorName } from '@/modules/vendors/domain/name-matching';
import type { OcrDuplicateHit } from './types';

export interface DuplicateIndexRow {
  readonly kind: 'expense' | 'vendor_bill' | 'document' | 'ocr_job';
  readonly id: string;
  readonly vendorId?: string | null;
  readonly vendorName?: string | null;
  readonly companyNumber?: string | null;
  readonly reference?: string | null;
  readonly date?: string | null;
  readonly amount?: string | null;
  readonly currency?: string | null;
  readonly checksumSha256?: string | null;
  readonly documentId?: string | null;
}

export interface DuplicateProbe {
  readonly vendorId?: string | null;
  readonly vendorName?: string | null;
  readonly companyNumber?: string | null;
  readonly reference?: string | null;
  readonly date?: string | null;
  readonly amount?: string | null;
  readonly currency?: string | null;
  readonly checksumSha256?: string | null;
  readonly documentId?: string | null;
  readonly jobId?: string | null;
}

function normRef(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

function moneyKey(value: string | null | undefined): string {
  const parsed = Number((value ?? '').trim());
  if (!Number.isFinite(parsed)) return '';
  return parsed.toFixed(2);
}

export function detectDuplicateHits(
  probe: DuplicateProbe,
  rows: readonly DuplicateIndexRow[],
): OcrDuplicateHit[] {
  const hits: OcrDuplicateHit[] = [];
  const checksum = probe.checksumSha256?.trim().toLowerCase() ?? '';

  for (const row of rows) {
    if (probe.jobId && row.kind === 'ocr_job' && row.id === probe.jobId) continue;
    if (probe.documentId && row.kind === 'document' && row.id === probe.documentId) continue;

    if (checksum && row.checksumSha256?.toLowerCase() === checksum) {
      hits.push({
        kind: 'exact_file',
        reasonKeys: ['checksum'],
        expenseId: row.kind === 'expense' ? row.id : undefined,
        vendorBillId: row.kind === 'vendor_bill' ? row.id : undefined,
        documentId: row.documentId ?? (row.kind === 'document' ? row.id : undefined),
        jobId: row.kind === 'ocr_job' ? row.id : undefined,
      });
      continue;
    }

    const reasons: string[] = [];
    if (probe.vendorId && row.vendorId && probe.vendorId === row.vendorId) reasons.push('vendor');
    else if (
      probe.vendorName &&
      row.vendorName &&
      normalizeVendorName(probe.vendorName) === normalizeVendorName(row.vendorName)
    ) {
      reasons.push('vendorName');
    }
    if (probe.companyNumber && row.companyNumber && probe.companyNumber === row.companyNumber) {
      reasons.push('companyNumber');
    }
    if (probe.reference && row.reference && normRef(probe.reference) === normRef(row.reference)) {
      reasons.push('reference');
    }
    if (probe.date && row.date && probe.date === row.date) reasons.push('date');
    if (
      probe.amount &&
      row.amount &&
      moneyKey(probe.amount) &&
      moneyKey(probe.amount) === moneyKey(row.amount)
    ) {
      reasons.push('amount');
    }
    if (
      probe.currency &&
      row.currency &&
      probe.currency.toUpperCase() === row.currency.toUpperCase()
    ) {
      reasons.push('currency');
    }

    const identity = reasons.includes('reference') && (reasons.includes('vendor') || reasons.includes('vendorName') || reasons.includes('companyNumber'));
    const amountDate = reasons.includes('amount') && reasons.includes('date') && (reasons.includes('vendor') || reasons.includes('vendorName'));
    if (identity || amountDate) {
      hits.push({
        kind: 'probable_document',
        reasonKeys: reasons,
        expenseId: row.kind === 'expense' ? row.id : undefined,
        vendorBillId: row.kind === 'vendor_bill' ? row.id : undefined,
        documentId: row.documentId ?? (row.kind === 'document' ? row.id : undefined),
        jobId: row.kind === 'ocr_job' ? row.id : undefined,
      });
    }
  }

  return hits;
}

export function shouldReuseExistingJob(status: string): boolean {
  return (
    status === 'needs_review' ||
    status === 'queued' ||
    status === 'running' ||
    status === 'processing' ||
    status === 'succeeded'
  );
}
