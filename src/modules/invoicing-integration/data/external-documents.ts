/**
 * External statutory document persistence facade.
 * Drizzle when ready; otherwise TEST DOUBLE in-memory (non-durable).
 * Never fakes provider completion - storage ≠ configured provider.
 */

import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { areInvoicingIntegrationTablesAvailable } from '../domain/persistence';
import {
  assertBillingRecordSameOrg,
  assertPdfDocumentSameOrg,
} from './same-org-guards';
import type {
  ExternalDocumentKind,
  ExternalDocumentStatus,
  ExternalPdfMetadata,
  ExternalStatutoryDocument,
} from '../domain/types';
import {
  createExternalDocumentRow as createInMemory,
  findExternalDocumentByExternalId as findByExternalIdInMemory,
  findExternalDocumentById as findByIdInMemory,
  listExternalDocumentsForBilling as listInMemory,
  updateExternalDocumentRow as updateInMemory,
} from './in-memory-external-documents.store';
import {
  drizzleExternalDocumentsRepository,
  drizzleProviderConnectionsRepository,
  type ExternalDocumentInsert,
  type ExternalDocumentPatch,
  type ExternalDocumentsRepository,
  type ProviderConnectionsRepository,
} from './external-documents.repository';

let docsRepo: ExternalDocumentsRepository | null = null;
let connectionsRepo: ProviderConnectionsRepository | null = null;

export function setExternalDocumentsRepositoryForTests(
  repo: ExternalDocumentsRepository | null,
): void {
  docsRepo = repo;
}

export function setProviderConnectionsRepositoryForTests(
  repo: ProviderConnectionsRepository | null,
): void {
  connectionsRepo = repo;
}

export function getExternalDocumentsRepository(): ExternalDocumentsRepository {
  return docsRepo ?? drizzleExternalDocumentsRepository;
}

export function getProviderConnectionsRepository(): ProviderConnectionsRepository {
  return connectionsRepo ?? drizzleProviderConnectionsRepository;
}

async function assertPdfIfPresent(
  context: OrgContext,
  pdf: ExternalPdfMetadata | null | undefined,
): Promise<void> {
  const docId = pdf?.storageDocumentId;
  if (!docId) return;
  await assertPdfDocumentSameOrg(context.db, context.organizationId, docId);
}

export async function createExternalDocument(
  context: OrgContext,
  input: {
    billingRecordId: string;
    providerId: string;
    kind: ExternalDocumentKind;
    status?: ExternalDocumentStatus;
    externalId?: string | null;
    externalNumber?: string | null;
    externalUrl?: string | null;
    pdf?: ExternalPdfMetadata | null;
    allocationReference?: string | null;
    lastErrorCode?: string | null;
    lastErrorMessage?: string | null;
    issuedAt?: string | null;
  },
): Promise<ExternalStatutoryDocument> {
  if (areInvoicingIntegrationTablesAvailable()) {
    await assertBillingRecordSameOrg(
      context.db,
      context.organizationId,
      input.billingRecordId,
    );
    await assertPdfIfPresent(context, input.pdf);
    const insert: ExternalDocumentInsert = {
      organizationId: context.organizationId,
      billingRecordId: input.billingRecordId,
      providerId: input.providerId,
      kind: input.kind,
      status: input.status,
      externalId: input.externalId,
      externalNumber: input.externalNumber,
      externalUrl: input.externalUrl,
      pdf: input.pdf,
      allocationReference: input.allocationReference,
      lastErrorCode: input.lastErrorCode,
      lastErrorMessage: input.lastErrorMessage,
      issuedAt: input.issuedAt,
      createdBy: context.userId,
    };
    return getExternalDocumentsRepository().create(context.db, insert);
  }

  return createInMemory({
    organizationId: context.organizationId,
    ...input,
  });
}

export async function updateExternalDocument(
  context: OrgContext,
  id: string,
  patch: ExternalDocumentPatch,
): Promise<ExternalStatutoryDocument | null> {
  if (areInvoicingIntegrationTablesAvailable()) {
    await assertPdfIfPresent(context, patch.pdf);
    return getExternalDocumentsRepository().update(
      context.db,
      context.organizationId,
      id,
      patch,
    );
  }
  return updateInMemory(context.organizationId, id, patch);
}

export async function findExternalDocument(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  id: string,
): Promise<ExternalStatutoryDocument | null> {
  if (areInvoicingIntegrationTablesAvailable()) {
    return getExternalDocumentsRepository().findById(context.db, context.organizationId, id);
  }
  return findByIdInMemory(context.organizationId, id);
}

export async function findExternalDocumentByProviderId(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  externalId: string,
): Promise<ExternalStatutoryDocument | null> {
  if (areInvoicingIntegrationTablesAvailable()) {
    return getExternalDocumentsRepository().findByExternalId(
      context.db,
      context.organizationId,
      externalId,
    );
  }
  return findByExternalIdInMemory(context.organizationId, externalId);
}

export async function listExternalDocuments(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  billingRecordId: string,
): Promise<ExternalStatutoryDocument[]> {
  if (areInvoicingIntegrationTablesAvailable()) {
    return getExternalDocumentsRepository().listForBilling(
      context.db,
      context.organizationId,
      billingRecordId,
    );
  }
  return listInMemory(context.organizationId, billingRecordId);
}

/**
 * Reject cross-tenant billing bridge refs even on the TEST DOUBLE path
 * when a live db handle is available; otherwise rely on bridge org field.
 */
export async function assertBillingBridgeSameOrg(
  context: OrgContext,
  billingRecordId: string,
  bridgeOrganizationId: string,
): Promise<void> {
  if (bridgeOrganizationId !== context.organizationId) {
    throw new DomainRuleError(
      'Billing record organization mismatch',
      'invoicingIntegration.errors.orgMismatch',
    );
  }
  if (areInvoicingIntegrationTablesAvailable()) {
    await assertBillingRecordSameOrg(context.db, context.organizationId, billingRecordId);
  }
}
