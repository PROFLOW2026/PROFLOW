/**
 * Drizzle repositories for external statutory documents + provider connections.
 * Production path only when `INVOICING_INTEGRATION_PERSISTENCE_READY` is true.
 */

import { and, asc, eq } from 'drizzle-orm';
import {
  externalInvoicingProviderConnections,
  externalStatutoryDocuments,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ExternalDocumentKind,
  ExternalDocumentStatus,
  ExternalPdfMetadata,
  ExternalStatutoryDocument,
  StatutoryProviderCapabilities,
} from '../domain/types';

export interface ExternalDocumentInsert {
  readonly organizationId: string;
  readonly billingRecordId: string;
  readonly providerId: string;
  readonly kind: ExternalDocumentKind;
  readonly status?: ExternalDocumentStatus;
  readonly externalId?: string | null;
  readonly externalNumber?: string | null;
  readonly externalUrl?: string | null;
  readonly pdf?: ExternalPdfMetadata | null;
  readonly allocationReference?: string | null;
  readonly lastErrorCode?: string | null;
  readonly lastErrorMessage?: string | null;
  readonly issuedAt?: string | null;
  readonly createdBy?: string | null;
}

export type ExternalDocumentPatch = Partial<{
  status: ExternalDocumentStatus;
  externalId: string | null;
  externalNumber: string | null;
  externalUrl: string | null;
  pdf: ExternalPdfMetadata | null;
  allocationReference: string | null;
  lastErrorCode: string | null;
  lastErrorMessage: string | null;
  issuedAt: string | null;
}>;

export interface ProviderConnectionRow {
  readonly id: string;
  readonly organizationId: string;
  readonly providerId: string;
  readonly status: 'disconnected' | 'connected' | 'error';
  readonly credentialsRef: string | null;
  readonly capabilities: StatutoryProviderCapabilities | Record<string, unknown>;
  readonly connectedAt: Date | null;
  readonly updatedAt: Date;
}

export interface ProviderConnectionUpsert {
  readonly organizationId: string;
  readonly providerId: string;
  readonly status: 'disconnected' | 'connected' | 'error';
  readonly credentialsRef?: string | null;
  readonly capabilities?: StatutoryProviderCapabilities | Record<string, unknown>;
  readonly connectedAt?: Date | null;
}

function toIso(value: Date | string | null | undefined): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value;
  return value.toISOString();
}

function mapDocument(row: typeof externalStatutoryDocuments.$inferSelect): ExternalStatutoryDocument {
  const hasPdf =
    row.pdfContentType != null ||
    row.pdfByteSize != null ||
    row.pdfChecksumSha256 != null ||
    row.pdfStorageDocumentId != null ||
    row.pdfFileName != null;

  return {
    id: row.id,
    organizationId: row.organizationId,
    billingRecordId: row.billingRecordId,
    providerId: row.providerId,
    kind: row.kind as ExternalDocumentKind,
    status: row.status as ExternalDocumentStatus,
    externalId: row.externalId,
    externalNumber: row.externalNumber,
    externalUrl: row.externalUrl,
    pdf: hasPdf
      ? {
          contentType: row.pdfContentType,
          byteSize: row.pdfByteSize,
          checksumSha256: row.pdfChecksumSha256,
          storageDocumentId: row.pdfStorageDocumentId,
          fileName: row.pdfFileName,
        }
      : null,
    allocationReference: row.allocationReference,
    lastErrorCode: row.lastErrorCode,
    lastErrorMessage: row.lastErrorMessage,
    requestedAt: toIso(row.requestedAt)!,
    updatedAt: toIso(row.updatedAt)!,
    issuedAt: toIso(row.issuedAt),
  };
}

function pdfColumns(pdf: ExternalPdfMetadata | null | undefined) {
  if (pdf === undefined) return {};
  if (pdf === null) {
    return {
      pdfContentType: null,
      pdfByteSize: null,
      pdfChecksumSha256: null,
      pdfStorageDocumentId: null,
      pdfFileName: null,
    };
  }
  return {
    pdfContentType: pdf.contentType,
    pdfByteSize: pdf.byteSize,
    pdfChecksumSha256: pdf.checksumSha256,
    pdfStorageDocumentId: pdf.storageDocumentId,
    pdfFileName: pdf.fileName,
  };
}

function mapConnection(
  row: typeof externalInvoicingProviderConnections.$inferSelect,
): ProviderConnectionRow {
  return {
    id: row.id,
    organizationId: row.organizationId,
    providerId: row.providerId,
    status: row.status as ProviderConnectionRow['status'],
    credentialsRef: row.credentialsRef,
    capabilities: (row.capabilitiesJson ?? {}) as ProviderConnectionRow['capabilities'],
    connectedAt: row.connectedAt,
    updatedAt: row.updatedAt,
  };
}

export interface ExternalDocumentsRepository {
  create(db: DbExecutor, input: ExternalDocumentInsert): Promise<ExternalStatutoryDocument>;
  update(
    db: DbExecutor,
    organizationId: string,
    id: string,
    patch: ExternalDocumentPatch,
  ): Promise<ExternalStatutoryDocument | null>;
  findById(
    db: DbExecutor,
    organizationId: string,
    id: string,
  ): Promise<ExternalStatutoryDocument | null>;
  findByExternalId(
    db: DbExecutor,
    organizationId: string,
    externalId: string,
  ): Promise<ExternalStatutoryDocument | null>;
  listForBilling(
    db: DbExecutor,
    organizationId: string,
    billingRecordId: string,
  ): Promise<ExternalStatutoryDocument[]>;
}

export interface ProviderConnectionsRepository {
  findByOrganization(
    db: DbExecutor,
    organizationId: string,
  ): Promise<ProviderConnectionRow | null>;
  upsert(db: DbExecutor, input: ProviderConnectionUpsert): Promise<ProviderConnectionRow>;
}

export const drizzleExternalDocumentsRepository: ExternalDocumentsRepository = {
  async create(db, input) {
    const issuedAt = input.issuedAt ? new Date(input.issuedAt) : null;
    const [row] = await db
      .insert(externalStatutoryDocuments)
      .values({
        organizationId: input.organizationId,
        billingRecordId: input.billingRecordId,
        providerId: input.providerId,
        kind: input.kind,
        status: input.status ?? 'requested',
        externalId: input.externalId ?? null,
        externalNumber: input.externalNumber ?? null,
        externalUrl: input.externalUrl ?? null,
        ...pdfColumns(input.pdf ?? null),
        allocationReference: input.allocationReference ?? null,
        lastErrorCode: input.lastErrorCode ?? null,
        lastErrorMessage: input.lastErrorMessage ?? null,
        issuedAt,
        createdBy: input.createdBy ?? null,
      })
      .returning();
    if (!row) throw new Error('Failed to insert external_statutory_document');
    return mapDocument(row);
  },

  async update(db, organizationId, id, patch) {
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (patch.status !== undefined) set.status = patch.status;
    if (patch.externalId !== undefined) set.externalId = patch.externalId;
    if (patch.externalNumber !== undefined) set.externalNumber = patch.externalNumber;
    if (patch.externalUrl !== undefined) set.externalUrl = patch.externalUrl;
    if (patch.allocationReference !== undefined) {
      set.allocationReference = patch.allocationReference;
    }
    if (patch.lastErrorCode !== undefined) set.lastErrorCode = patch.lastErrorCode;
    if (patch.lastErrorMessage !== undefined) set.lastErrorMessage = patch.lastErrorMessage;
    if (patch.issuedAt !== undefined) {
      set.issuedAt = patch.issuedAt ? new Date(patch.issuedAt) : null;
    }
    if (patch.pdf !== undefined) Object.assign(set, pdfColumns(patch.pdf));

    const [row] = await db
      .update(externalStatutoryDocuments)
      .set(set)
      .where(
        and(
          eq(externalStatutoryDocuments.id, id),
          eq(externalStatutoryDocuments.organizationId, organizationId),
        ),
      )
      .returning();
    return row ? mapDocument(row) : null;
  },

  async findById(db, organizationId, id) {
    const [row] = await db
      .select()
      .from(externalStatutoryDocuments)
      .where(
        and(
          eq(externalStatutoryDocuments.id, id),
          eq(externalStatutoryDocuments.organizationId, organizationId),
        ),
      )
      .limit(1);
    return row ? mapDocument(row) : null;
  },

  async findByExternalId(db, organizationId, externalId) {
    const [row] = await db
      .select()
      .from(externalStatutoryDocuments)
      .where(
        and(
          eq(externalStatutoryDocuments.organizationId, organizationId),
          eq(externalStatutoryDocuments.externalId, externalId),
        ),
      )
      .limit(1);
    return row ? mapDocument(row) : null;
  },

  async listForBilling(db, organizationId, billingRecordId) {
    const rows = await db
      .select()
      .from(externalStatutoryDocuments)
      .where(
        and(
          eq(externalStatutoryDocuments.organizationId, organizationId),
          eq(externalStatutoryDocuments.billingRecordId, billingRecordId),
        ),
      )
      .orderBy(asc(externalStatutoryDocuments.requestedAt));
    return rows.map(mapDocument);
  },
};

export const drizzleProviderConnectionsRepository: ProviderConnectionsRepository = {
  async findByOrganization(db, organizationId) {
    const [row] = await db
      .select()
      .from(externalInvoicingProviderConnections)
      .where(eq(externalInvoicingProviderConnections.organizationId, organizationId))
      .limit(1);
    return row ? mapConnection(row) : null;
  },

  async upsert(db, input) {
    const existing = await this.findByOrganization(db, input.organizationId);
    if (existing) {
      const [row] = await db
        .update(externalInvoicingProviderConnections)
        .set({
          providerId: input.providerId,
          status: input.status,
          credentialsRef: input.credentialsRef ?? existing.credentialsRef,
          capabilitiesJson: input.capabilities ?? existing.capabilities,
          connectedAt:
            input.connectedAt !== undefined ? input.connectedAt : existing.connectedAt,
          updatedAt: new Date(),
        })
        .where(eq(externalInvoicingProviderConnections.id, existing.id))
        .returning();
      return mapConnection(row!);
    }
    const [row] = await db
      .insert(externalInvoicingProviderConnections)
      .values({
        organizationId: input.organizationId,
        providerId: input.providerId,
        status: input.status,
        credentialsRef: input.credentialsRef ?? null,
        capabilitiesJson: input.capabilities ?? {},
        connectedAt: input.connectedAt ?? null,
      })
      .returning();
    return mapConnection(row!);
  },
};
