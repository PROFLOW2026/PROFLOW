import { isBusinessDate } from '@/shared/dates';
import type { BillingKind, BillingRecordStatus, CollectionStatus } from './types';

/** Stored columns for a collection follow-up. Not money, status, VAT, or due date. */
export const COLLECTION_FOLLOW_UP_COLUMNS = [
  'collectionContactedAt',
  'collectionNextFollowUpAt',
  'collectionPromiseToPayDate',
  'collectionNote',
] as const;

export type CollectionFollowUpColumn = (typeof COLLECTION_FOLLOW_UP_COLUMNS)[number];

export const COLLECTION_NOTE_MAX_LENGTH = 500;

const FINANCIAL_BILLING_FIELDS = [
  'amount',
  'subtotalAmount',
  'taxAmount',
  'totalAmount',
  'vatMode',
  'status',
  'dueDate',
  'issueDate',
  'currency',
  'notes',
] as const;

export interface CollectionFollowUpIssue {
  readonly path: string;
  readonly message: string;
}

export interface CollectionFollowUpFields {
  readonly collectionContactedAt: string | null;
  readonly collectionNextFollowUpAt: string | null;
  readonly collectionPromiseToPayDate: string | null;
  readonly collectionNote: string | null;
}

function emptyToNull(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function parseOptionalDate(
  path: CollectionFollowUpColumn,
  value: string | null | undefined,
  issues: CollectionFollowUpIssue[],
): string | null {
  const trimmed = emptyToNull(value);
  if (trimmed == null) return null;
  if (!isBusinessDate(trimmed)) {
    issues.push({ path, message: 'billing.errors.collectionDateInvalid' });
    return null;
  }
  return trimmed;
}

/**
 * Normalizes the four collection fields. Empty dates and a blank note become null.
 * Does not accept or return amount, status, VAT, or due date.
 */
export function validateCollectionFollowUp(raw: {
  readonly collectionContactedAt?: string | null;
  readonly collectionNextFollowUpAt?: string | null;
  readonly collectionPromiseToPayDate?: string | null;
  readonly collectionNote?: string | null;
}): { ok: true; value: CollectionFollowUpFields } | { ok: false; issues: readonly CollectionFollowUpIssue[] } {
  const issues: CollectionFollowUpIssue[] = [];
  const collectionContactedAt = parseOptionalDate(
    'collectionContactedAt',
    raw.collectionContactedAt,
    issues,
  );
  const collectionNextFollowUpAt = parseOptionalDate(
    'collectionNextFollowUpAt',
    raw.collectionNextFollowUpAt,
    issues,
  );
  const collectionPromiseToPayDate = parseOptionalDate(
    'collectionPromiseToPayDate',
    raw.collectionPromiseToPayDate,
    issues,
  );
  const collectionNote = emptyToNull(raw.collectionNote);
  if (collectionNote && collectionNote.length > COLLECTION_NOTE_MAX_LENGTH) {
    issues.push({ path: 'collectionNote', message: 'billing.errors.collectionNoteTooLong' });
  }
  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      collectionContactedAt,
      collectionNextFollowUpAt,
      collectionPromiseToPayDate,
      collectionNote,
    },
  };
}

/** The object written to the row. Keys are exactly the four collection columns. */
export function collectionFollowUpColumnSet(value: CollectionFollowUpFields): CollectionFollowUpFields {
  return {
    collectionContactedAt: value.collectionContactedAt,
    collectionNextFollowUpAt: value.collectionNextFollowUpAt,
    collectionPromiseToPayDate: value.collectionPromiseToPayDate,
    collectionNote: value.collectionNote,
  };
}

export function isCollectionFollowUpColumnSet(keys: readonly string[]): boolean {
  if (keys.length !== COLLECTION_FOLLOW_UP_COLUMNS.length) return false;
  const present = new Set(keys);
  return COLLECTION_FOLLOW_UP_COLUMNS.every((key) => present.has(key));
}

export function collectionPatchTouchesFinancialFields(keys: readonly string[]): boolean {
  const financial = new Set<string>(FINANCIAL_BILLING_FIELDS);
  return keys.some((key) => financial.has(key));
}

/** Finalized non-credit billing that still has cash to collect (open, partial, or overdue). */
export function showsCollectionFollowUp(input: {
  readonly status: BillingRecordStatus;
  readonly kind: BillingKind;
  readonly collectionStatus: CollectionStatus | null;
}): boolean {
  if (input.status !== 'finalized') return false;
  if (input.kind === 'credit_note') return false;
  return (
    input.collectionStatus === 'open' ||
    input.collectionStatus === 'partial' ||
    input.collectionStatus === 'overdue'
  );
}

/** A finalized record that is not itself a credit note can be adjusted by a new credit note. */
export function canIssueInternalCreditNote(input: {
  readonly status: BillingRecordStatus;
  readonly kind: BillingKind;
}): boolean {
  return input.status === 'finalized' && input.kind !== 'credit_note';
}
