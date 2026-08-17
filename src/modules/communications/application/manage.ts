import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getDocumentById } from '@/modules/documents';
import {
  findOutboundCommunication,
  insertOutboundCommunication,
  listCommunicationAttachments,
  listCommunicationAttempts,
  listOutboundCommunications,
  replaceCommunicationAttachments,
  updateOutboundCommunication,
} from '../data/communications.repository';
import type { CommunicationDetail, OutboundCommunicationRecord } from '../domain/types';
import { isTerminalCommunicationStatus } from '../domain/send-policy';
import {
  listCommunicationsSchema,
  saveCommunicationDraftSchema,
  type ListCommunicationsInput,
  type SaveCommunicationDraftInput,
} from '../validation/schemas';

function parseOrThrow<T>(
  result:
    | { success: true; data: T }
    | { success: false; error: { issues: { path: PropertyKey[]; message: string }[] } },
): T {
  if (!result.success) {
    throw new ValidationError(
      result.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return result.data;
}

async function assertDocumentsSameOrg(
  context: OrgContext,
  documentIds: readonly string[],
): Promise<void> {
  for (const documentId of documentIds) {
    const document = await getDocumentById(context, documentId);
    if (!document) throw new NotFoundError('Document');
  }
}

export async function saveCommunicationDraft(
  context: OrgContext,
  raw: SaveCommunicationDraftInput,
): Promise<OutboundCommunicationRecord> {
  assertPermission(context, PERMISSIONS.COMMUNICATIONS_MANAGE);
  const input = parseOrThrow(saveCommunicationDraftSchema.safeParse(raw));
  await assertDocumentsSameOrg(context, input.documentIds ?? []);

  if (input.communicationId) {
    const existing = await findOutboundCommunication(
      context.db,
      context.organizationId,
      input.communicationId,
    );
    if (!existing) throw new NotFoundError('Communication');
    if (existing.status === 'sent') {
      throw new DomainRuleError(
        'A delivered message cannot be edited',
        'communications.errors.cannotMarkSent',
      );
    }
    if (isTerminalCommunicationStatus(existing.status) && existing.status === 'cancelled') {
      throw new DomainRuleError('Cancelled messages cannot be edited', 'communications.errors.cannotMarkSent');
    }
    const updated = await updateOutboundCommunication(
      context.db,
      context.organizationId,
      existing.id,
      {
        relatedEntityType: input.relatedEntityType,
        relatedEntityId: input.relatedEntityId ?? null,
        projectId: input.projectId ?? null,
        clientId: input.clientId ?? null,
        vendorId: input.vendorId ?? null,
        recipientEmail: input.recipientEmail,
        recipientName: input.recipientName ?? null,
        subject: input.subject,
        bodyText: input.bodyText,
        bodyHtml: input.bodyHtml ?? null,
        status: existing.status === 'queued' || existing.status === 'failed' ? existing.status : 'draft',
      },
    );
    if (!updated) throw new NotFoundError('Communication');
    if (input.documentIds) {
      await replaceCommunicationAttachments(
        context.db,
        context.organizationId,
        updated.id,
        input.documentIds,
      );
    }
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.COMMUNICATION_CREATED,
      entityType: 'outbound_communication',
      entityId: updated.id,
      after: { status: updated.status, subject: updated.subject },
    });
    return updated;
  }

  const created = await insertOutboundCommunication(context.db, {
    organizationId: context.organizationId,
    relatedEntityType: input.relatedEntityType,
    relatedEntityId: input.relatedEntityId ?? null,
    projectId: input.projectId ?? null,
    clientId: input.clientId ?? null,
    vendorId: input.vendorId ?? null,
    recipientEmail: input.recipientEmail,
    recipientName: input.recipientName ?? null,
    subject: input.subject,
    bodyText: input.bodyText,
    bodyHtml: input.bodyHtml ?? null,
    createdByUserId: context.userId,
  });
  if (input.documentIds?.length) {
    await replaceCommunicationAttachments(
      context.db,
      context.organizationId,
      created.id,
      input.documentIds,
    );
  }
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COMMUNICATION_CREATED,
    entityType: 'outbound_communication',
    entityId: created.id,
    after: { status: 'draft', subject: created.subject },
  });
  return created;
}

export async function queueCommunication(
  context: OrgContext,
  communicationId: string,
): Promise<OutboundCommunicationRecord> {
  assertPermission(context, PERMISSIONS.COMMUNICATIONS_MANAGE);
  const existing = await findOutboundCommunication(
    context.db,
    context.organizationId,
    communicationId,
  );
  if (!existing) throw new NotFoundError('Communication');
  if (existing.status === 'sent') {
    throw new DomainRuleError(
      'Already confirmed delivered',
      'communications.errors.cannotMarkSent',
    );
  }
  if (existing.status === 'cancelled') {
    throw new DomainRuleError('Cancelled messages cannot be queued', 'communications.errors.cannotMarkSent');
  }
  const updated = await updateOutboundCommunication(context.db, context.organizationId, existing.id, {
    status: 'queued',
  });
  if (!updated) throw new NotFoundError('Communication');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COMMUNICATION_QUEUED,
    entityType: 'outbound_communication',
    entityId: updated.id,
    after: { status: 'queued' },
  });
  return updated;
}

export async function cancelCommunication(
  context: OrgContext,
  communicationId: string,
): Promise<OutboundCommunicationRecord> {
  assertPermission(context, PERMISSIONS.COMMUNICATIONS_MANAGE);
  const existing = await findOutboundCommunication(
    context.db,
    context.organizationId,
    communicationId,
  );
  if (!existing) throw new NotFoundError('Communication');
  if (existing.status === 'sent') {
    throw new DomainRuleError(
      'A delivered message cannot be cancelled',
      'communications.errors.cannotMarkSent',
    );
  }
  const updated = await updateOutboundCommunication(context.db, context.organizationId, existing.id, {
    status: 'cancelled',
  });
  if (!updated) throw new NotFoundError('Communication');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.COMMUNICATION_CANCELLED,
    entityType: 'outbound_communication',
    entityId: updated.id,
    after: { status: 'cancelled' },
  });
  return updated;
}

export async function listCommunications(
  context: OrgContext,
  raw: ListCommunicationsInput = {},
): Promise<OutboundCommunicationRecord[]> {
  assertPermission(context, PERMISSIONS.COMMUNICATIONS_READ);
  const filters = parseOrThrow(listCommunicationsSchema.safeParse(raw));
  return listOutboundCommunications(context.db, context.organizationId, filters);
}

export async function getCommunication(
  context: OrgContext,
  communicationId: string,
): Promise<CommunicationDetail> {
  assertPermission(context, PERMISSIONS.COMMUNICATIONS_READ);
  const record = await findOutboundCommunication(
    context.db,
    context.organizationId,
    communicationId,
  );
  if (!record) throw new NotFoundError('Communication');
  const [attempts, attachments] = await Promise.all([
    listCommunicationAttempts(context.db, context.organizationId, record.id),
    listCommunicationAttachments(context.db, context.organizationId, record.id),
  ]);
  return { ...record, attempts, attachments };
}
