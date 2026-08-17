import { and, desc, eq, isNull } from 'drizzle-orm';
import {
  outboundCommunicationAttachments,
  outboundCommunicationAttempts,
  outboundCommunications,
} from '@drizzle/schema';
import { ORG_LIST_HARD_CAP, resolveListLimit } from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  CommunicationAttemptRecord,
  CommunicationAttachmentRecord,
  CommunicationEntityType,
  CommunicationStatus,
  OutboundCommunicationRecord,
} from '../domain/types';

function mapCommunication(
  row: typeof outboundCommunications.$inferSelect,
): OutboundCommunicationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    relatedEntityType: row.relatedEntityType as CommunicationEntityType,
    relatedEntityId: row.relatedEntityId,
    projectId: row.projectId,
    clientId: row.clientId,
    vendorId: row.vendorId,
    recipientEmail: row.recipientEmail,
    recipientName: row.recipientName,
    subject: row.subject,
    bodyText: row.bodyText,
    bodyHtml: row.bodyHtml,
    status: row.status as CommunicationStatus,
    providerKey: row.providerKey,
    providerMessageId: row.providerMessageId,
    lastError: row.lastError,
    sentAt: row.sentAt,
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listOutboundCommunications(
  db: DbExecutor,
  organizationId: string,
  filters: {
    readonly status?: CommunicationStatus;
    readonly relatedEntityType?: CommunicationEntityType;
    readonly relatedEntityId?: string;
    readonly projectId?: string;
    readonly clientId?: string;
    readonly vendorId?: string;
    readonly limit?: number;
  } = {},
): Promise<OutboundCommunicationRecord[]> {
  const clauses = [
    eq(outboundCommunications.organizationId, organizationId),
    isNull(outboundCommunications.archivedAt),
  ];
  if (filters.status) clauses.push(eq(outboundCommunications.status, filters.status));
  if (filters.relatedEntityType) {
    clauses.push(eq(outboundCommunications.relatedEntityType, filters.relatedEntityType));
  }
  if (filters.relatedEntityId) {
    clauses.push(eq(outboundCommunications.relatedEntityId, filters.relatedEntityId));
  }
  if (filters.projectId) clauses.push(eq(outboundCommunications.projectId, filters.projectId));
  if (filters.clientId) clauses.push(eq(outboundCommunications.clientId, filters.clientId));
  if (filters.vendorId) clauses.push(eq(outboundCommunications.vendorId, filters.vendorId));

  const rows = await db
    .select()
    .from(outboundCommunications)
    .where(and(...clauses))
    .orderBy(desc(outboundCommunications.updatedAt))
    .limit(resolveListLimit(filters.limit, { hardCap: ORG_LIST_HARD_CAP }));

  return rows.map(mapCommunication);
}

export async function findOutboundCommunication(
  db: DbExecutor,
  organizationId: string,
  communicationId: string,
): Promise<OutboundCommunicationRecord | null> {
  const [row] = await db
    .select()
    .from(outboundCommunications)
    .where(
      and(
        eq(outboundCommunications.id, communicationId),
        eq(outboundCommunications.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? mapCommunication(row) : null;
}

export async function insertOutboundCommunication(
  db: DbExecutor,
  values: {
    organizationId: string;
    relatedEntityType: CommunicationEntityType;
    relatedEntityId: string | null;
    projectId: string | null;
    clientId: string | null;
    vendorId: string | null;
    recipientEmail: string;
    recipientName: string | null;
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
    createdByUserId: string | null;
  },
): Promise<OutboundCommunicationRecord> {
  const [row] = await db
    .insert(outboundCommunications)
    .values({
      organizationId: values.organizationId,
      relatedEntityType: values.relatedEntityType,
      relatedEntityId: values.relatedEntityId,
      projectId: values.projectId,
      clientId: values.clientId,
      vendorId: values.vendorId,
      recipientEmail: values.recipientEmail,
      recipientName: values.recipientName,
      subject: values.subject,
      bodyText: values.bodyText,
      bodyHtml: values.bodyHtml,
      status: 'draft',
      createdByUserId: values.createdByUserId,
    })
    .returning();
  if (!row) throw new Error('Failed to insert outbound communication');
  return mapCommunication(row);
}

export async function updateOutboundCommunication(
  db: DbExecutor,
  organizationId: string,
  communicationId: string,
  patch: Partial<{
    relatedEntityType: CommunicationEntityType;
    relatedEntityId: string | null;
    projectId: string | null;
    clientId: string | null;
    vendorId: string | null;
    recipientEmail: string;
    recipientName: string | null;
    subject: string;
    bodyText: string;
    bodyHtml: string | null;
    status: CommunicationStatus;
    providerKey: string | null;
    providerMessageId: string | null;
    lastError: string | null;
    sentAt: Date | null;
  }>,
): Promise<OutboundCommunicationRecord | null> {
  const [row] = await db
    .update(outboundCommunications)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(outboundCommunications.id, communicationId),
        eq(outboundCommunications.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapCommunication(row) : null;
}

export async function insertCommunicationAttempt(
  db: DbExecutor,
  values: {
    organizationId: string;
    communicationId: string;
    result: CommunicationAttemptRecord['result'];
    providerMessageId: string | null;
    errorMessage: string | null;
  },
): Promise<CommunicationAttemptRecord> {
  const [row] = await db
    .insert(outboundCommunicationAttempts)
    .values({
      organizationId: values.organizationId,
      communicationId: values.communicationId,
      result: values.result,
      providerMessageId: values.providerMessageId,
      errorMessage: values.errorMessage,
    })
    .returning();
  if (!row) throw new Error('Failed to insert communication attempt');
  return {
    id: row.id,
    organizationId: row.organizationId,
    communicationId: row.communicationId,
    result: row.result as CommunicationAttemptRecord['result'],
    providerMessageId: row.providerMessageId,
    errorMessage: row.errorMessage,
    attemptedAt: row.attemptedAt,
  };
}

export async function listCommunicationAttempts(
  db: DbExecutor,
  organizationId: string,
  communicationId: string,
): Promise<CommunicationAttemptRecord[]> {
  const rows = await db
    .select()
    .from(outboundCommunicationAttempts)
    .where(
      and(
        eq(outboundCommunicationAttempts.organizationId, organizationId),
        eq(outboundCommunicationAttempts.communicationId, communicationId),
      ),
    )
    .orderBy(desc(outboundCommunicationAttempts.attemptedAt));
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    communicationId: row.communicationId,
    result: row.result as CommunicationAttemptRecord['result'],
    providerMessageId: row.providerMessageId,
    errorMessage: row.errorMessage,
    attemptedAt: row.attemptedAt,
  }));
}

export async function replaceCommunicationAttachments(
  db: DbExecutor,
  organizationId: string,
  communicationId: string,
  documentIds: readonly string[],
): Promise<CommunicationAttachmentRecord[]> {
  await db
    .delete(outboundCommunicationAttachments)
    .where(
      and(
        eq(outboundCommunicationAttachments.organizationId, organizationId),
        eq(outboundCommunicationAttachments.communicationId, communicationId),
      ),
    );
  if (documentIds.length === 0) return [];
  const rows = await db
    .insert(outboundCommunicationAttachments)
    .values(
      documentIds.map((documentId) => ({
        organizationId,
        communicationId,
        documentId,
      })),
    )
    .returning();
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    communicationId: row.communicationId,
    documentId: row.documentId,
  }));
}

export async function listCommunicationAttachments(
  db: DbExecutor,
  organizationId: string,
  communicationId: string,
): Promise<CommunicationAttachmentRecord[]> {
  const rows = await db
    .select()
    .from(outboundCommunicationAttachments)
    .where(
      and(
        eq(outboundCommunicationAttachments.organizationId, organizationId),
        eq(outboundCommunicationAttachments.communicationId, communicationId),
      ),
    );
  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    communicationId: row.communicationId,
    documentId: row.documentId,
  }));
}
