export const EXPENSE_INGESTION_PROVIDERS = ['none', 'sumit'] as const;
export type ExpenseIngestionProvider = (typeof EXPENSE_INGESTION_PROVIDERS)[number];

export const EXTERNAL_EXPENSE_IMPORT_STATUSES = [
  'detected',
  'ocr_queued',
  'needs_review',
  'failed',
  'linked',
  'ignored',
] as const;

export type ExternalExpenseImportStatus = (typeof EXTERNAL_EXPENSE_IMPORT_STATUSES)[number];

export const SUMIT_EXPENSE_IMPORT_PROVIDER = 'sumit' as const;

export interface ExternalExpenseImport {
  readonly id: string;
  readonly organizationId: string;
  readonly provider: typeof SUMIT_EXPENSE_IMPORT_PROVIDER;
  readonly externalDocumentId: string;
  readonly sourceDocumentType: number | null;
  readonly status: ExternalExpenseImportStatus;
  readonly ocrJobId: string | null;
  readonly pdfChecksumSha256: string | null;
  readonly detectedAt: string;
  readonly lastCheckedAt: string | null;
  readonly processedAt: string | null;
  readonly errorCode: string | null;
  readonly errorMessage: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export function sumitOcrIdempotencyKey(documentId: string): string {
  return `sumit:${documentId}`;
}

export function parseSumitIdempotencyKey(key: string | null | undefined): string | null {
  if (!key?.startsWith('sumit:')) return null;
  const id = key.slice('sumit:'.length).trim();
  return id.length > 0 ? id : null;
}

/**
 * SUMIT document id for a later OCR worker. Prefer an explicit id, then job metadata,
 * then the durable idempotency key `sumit:{documentId}`.
 */
export function resolveSumitDocumentIdForOcrJob(input: {
  readonly sumitDocumentId?: string | null;
  readonly externalDocumentId?: string | null;
  readonly idempotencyKey?: string | null;
}): string | null {
  const explicit = input.sumitDocumentId?.trim();
  if (explicit) return explicit;
  const stored = input.externalDocumentId?.trim();
  if (stored) return stored;
  return parseSumitIdempotencyKey(input.idempotencyKey);
}
