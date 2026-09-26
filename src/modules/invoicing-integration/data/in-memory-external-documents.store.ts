/**
 * TEST DOUBLE ONLY - process-local external statutory document store.
 *
 * Not durable across instances. Production default when
 * `INVOICING_INTEGRATION_PERSISTENCE_READY` is true uses Drizzle.
 * Does not imply a real statutory provider is configured.
 */

import { randomUUID } from 'node:crypto';
import type {
  ExternalDocumentKind,
  ExternalDocumentStatus,
  ExternalPdfMetadata,
  ExternalStatutoryDocument,
  IssuanceOutcome,
  ReconciliationMetadata,
  ReconciliationStatus,
} from '../domain/types';

type Row = ExternalStatutoryDocument;

const docsByOrg = new Map<string, Map<string, Row>>();

function orgBucket(organizationId: string): Map<string, Row> {
  let bucket = docsByOrg.get(organizationId);
  if (!bucket) {
    bucket = new Map();
    docsByOrg.set(organizationId, bucket);
  }
  return bucket;
}

function nowIso(): string {
  return new Date().toISOString();
}

export function resetExternalDocumentsStoreForTests(): void {
  docsByOrg.clear();
}

export function createExternalDocumentRow(input: {
  organizationId: string;
  billingRecordId: string;
  paymentId?: string | null;
  providerId: string;
  kind: ExternalDocumentKind;
  status?: ExternalDocumentStatus;
  externalId?: string | null;
  externalNumber?: string | null;
  externalUrl?: string | null;
  pdf?: ExternalPdfMetadata | null;
  allocationReference?: string | null;
  issuanceOutcome?: IssuanceOutcome | null;
  reconciliationStatus?: ReconciliationStatus | null;
  reconciliationMetadata?: ReconciliationMetadata | null;
  idempotencyKey?: string | null;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  issuedAt?: string | null;
}): ExternalStatutoryDocument {
  const requestedAt = nowIso();
  const row: Row = {
    id: randomUUID(),
    organizationId: input.organizationId,
    billingRecordId: input.billingRecordId,
    paymentId: input.paymentId ?? null,
    providerId: input.providerId,
    kind: input.kind,
    status: input.status ?? 'requested',
    externalId: input.externalId ?? null,
    externalNumber: input.externalNumber ?? null,
    externalUrl: input.externalUrl ?? null,
    pdf: input.pdf ?? null,
    allocationReference: input.allocationReference ?? null,
    issuanceOutcome: input.issuanceOutcome ?? null,
    reconciliationStatus: input.reconciliationStatus ?? null,
    reconciliationMetadata: input.reconciliationMetadata ?? null,
    idempotencyKey: input.idempotencyKey ?? null,
    lastErrorCode: input.lastErrorCode ?? null,
    lastErrorMessage: input.lastErrorMessage ?? null,
    requestedAt,
    updatedAt: requestedAt,
    issuedAt: input.issuedAt ?? null,
  };
  orgBucket(input.organizationId).set(row.id, row);
  return row;
}

export function updateExternalDocumentRow(
  organizationId: string,
  id: string,
  patch: Partial<{
    status: ExternalDocumentStatus;
    externalId: string | null;
    externalNumber: string | null;
    externalUrl: string | null;
    pdf: ExternalPdfMetadata | null;
    allocationReference: string | null;
    issuanceOutcome: IssuanceOutcome | null;
    reconciliationStatus: ReconciliationStatus | null;
    reconciliationMetadata: ReconciliationMetadata | null;
    idempotencyKey: string | null;
    lastErrorCode: string | null;
    lastErrorMessage: string | null;
    issuedAt: string | null;
  }>,
): ExternalStatutoryDocument | null {
  const bucket = orgBucket(organizationId);
  const existing = bucket.get(id);
  if (!existing) return null;
  const next: Row = {
    ...existing,
    ...patch,
    updatedAt: nowIso(),
  };
  bucket.set(id, next);
  return next;
}

export function findExternalDocumentById(
  organizationId: string,
  id: string,
): ExternalStatutoryDocument | null {
  return orgBucket(organizationId).get(id) ?? null;
}

export function findExternalDocumentByExternalId(
  organizationId: string,
  externalId: string,
): ExternalStatutoryDocument | null {
  for (const row of orgBucket(organizationId).values()) {
    if (row.externalId === externalId) return row;
  }
  return null;
}

export function listExternalDocumentsForBilling(
  organizationId: string,
  billingRecordId: string,
): ExternalStatutoryDocument[] {
  return [...orgBucket(organizationId).values()]
    .filter((row) => row.billingRecordId === billingRecordId)
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

export function listExternalDocumentsForPayment(
  organizationId: string,
  paymentId: string,
): ExternalStatutoryDocument[] {
  return [...orgBucket(organizationId).values()]
    .filter((row) => row.paymentId === paymentId)
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}

export function listExternalDocumentsByIssuanceOutcome(
  organizationId: string,
  issuanceOutcome: IssuanceOutcome,
): ExternalStatutoryDocument[] {
  return [...orgBucket(organizationId).values()]
    .filter((row) => row.issuanceOutcome === issuanceOutcome)
    .sort((a, b) => a.requestedAt.localeCompare(b.requestedAt));
}
