/**
 * Internal document tracking numbers — not Israeli statutory invoice issuance.
 */

export const DOCUMENT_NUMBER_KINDS = [
  'estimate',
  'change_request',
  'change_order',
  'purchase_order',
  'vendor_bill',
  'billing_record',
] as const;

export type DocumentNumberKind = (typeof DOCUMENT_NUMBER_KINDS)[number];

/** Kinds that consume org sequences on create. CR/CO keep per-project CO-001 / CR-001. */
export const ALLOCATED_DOCUMENT_NUMBER_KINDS = [
  'estimate',
  'purchase_order',
  'vendor_bill',
  'billing_record',
] as const;

export type AllocatedDocumentNumberKind = (typeof ALLOCATED_DOCUMENT_NUMBER_KINDS)[number];

export const DOCUMENT_NUMBER_PADDING_MIN = 1;
export const DOCUMENT_NUMBER_PADDING_MAX = 8;
export const DOCUMENT_NUMBER_PREFIX_MAX = 20;

export interface DocumentNumberSequenceRecord {
  readonly id: string | null;
  readonly organizationId: string;
  readonly documentKind: DocumentNumberKind;
  readonly prefix: string;
  readonly padding: number;
  readonly nextNumber: number;
}

export function isDocumentNumberKind(value: string): value is DocumentNumberKind {
  return (DOCUMENT_NUMBER_KINDS as readonly string[]).includes(value);
}

export function isAllocatedDocumentNumberKind(value: string): value is AllocatedDocumentNumberKind {
  return (ALLOCATED_DOCUMENT_NUMBER_KINDS as readonly string[]).includes(value);
}

export function suppliedDocumentReference(value: string | null | undefined): string | null {
  const trimmed = value?.trim() ?? '';
  return trimmed.length > 0 ? trimmed : null;
}

export function titleWithDocumentNumber(title: string, documentNumber: string): string {
  const trimmedTitle = title.trim();
  const trimmedNumber = documentNumber.trim();
  if (!trimmedNumber) return trimmedTitle;
  if (trimmedTitle === trimmedNumber || trimmedTitle.startsWith(`${trimmedNumber} `) || trimmedTitle.startsWith(`${trimmedNumber}—`) || trimmedTitle.startsWith(`${trimmedNumber} –`) || trimmedTitle.startsWith(`${trimmedNumber} —`)) {
    return trimmedTitle;
  }
  return `${trimmedNumber} — ${trimmedTitle}`;
}

export function defaultDocumentNumberSequence(
  organizationId: string,
  kind: DocumentNumberKind,
): DocumentNumberSequenceRecord {
  return {
    id: null,
    organizationId,
    documentKind: kind,
    prefix: '',
    padding: 4,
    nextNumber: 1,
  };
}
