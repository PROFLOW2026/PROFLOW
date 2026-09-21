import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  findDocumentById,
  findDocumentLinkById,
} from '@/modules/documents';
import { linkDocumentToEntity, unlinkDocumentFromEntity } from '@/modules/documents/application/link-document';
import { getEntityDocumentPanelData } from '@/modules/documents/application/entity-document-panel';
import { listDocumentsForOrg, listEntityDocuments } from '@/modules/documents/application/upload-document';
import type { DocumentLinkRecord, DocumentListItem } from '@/modules/documents/domain/types';
import type { EntityDocumentPanelData } from '@/modules/documents/application/entity-document-panel';
import {
  findTaskById,
  insertTaskActivity,
} from '../data/tasks.repository';
import { buildActivityActorFieldsFromContext } from '../domain/actor';
import { assertCanAccessTask } from './assert-task-access';

export type TaskDocumentPanelData = EntityDocumentPanelData;

async function recordAttachmentActivity(
  context: OrgContext,
  taskId: string,
  eventType: 'attachment_added' | 'attachment_removed',
  payload: { documentId: string; linkId?: string; filename?: string | null },
): Promise<void> {
  await insertTaskActivity(context.db, {
    taskId,
    organizationId: context.organizationId,
    ...buildActivityActorFieldsFromContext(context),
    eventType,
    payload,
  });
}

/** Records attachment activity after caller has verified task + document access. */
export async function recordTaskAttachmentEvent(
  context: OrgContext,
  taskId: string,
  eventType: 'attachment_added' | 'attachment_removed',
  payload: { documentId: string; linkId?: string; filename?: string | null },
): Promise<void> {
  await recordAttachmentActivity(context, taskId, eventType, payload);
}

/**
 * Lists documents linked to a task via document_links(owner_type = task).
 */
export async function listTaskAttachments(
  context: OrgContext,
  taskId: string,
): Promise<readonly DocumentListItem[]> {
  assertPermission(context, PERMISSIONS.DOCUMENTS_READ);
  await assertCanAccessTask(context, taskId);

  return listEntityDocuments(context, { ownerType: 'task', ownerId: taskId });
}

/**
 * Shared loader for task attachment UI (linked docs + link-existing candidates).
 */
export async function getTaskDocumentPanelData(
  context: OrgContext,
  taskId: string,
): Promise<TaskDocumentPanelData> {
  const task = await assertCanAccessTask(context, taskId);
  const panel = await getEntityDocumentPanelData(context, 'task', taskId);

  if (!task.projectId || !panel.canRead || !panel.canManage) {
    return panel;
  }

  const projectDocuments = await listDocumentsForOrg(context, { projectId: task.projectId });
  const attachedIds = new Set(panel.documents.map((document) => document.id));
  const linkCandidates = projectDocuments
    .filter((document) => document.status === 'available' && !attachedIds.has(document.id))
    .map((document) => ({
      id: document.id,
      originalFilename: document.originalFilename,
    }));

  return {
    ...panel,
    linkCandidates,
    projectId: task.projectId,
    canBrowseCloudFiles: panel.canManage && Boolean(task.projectId) && panel.storageConfigured,
  };
}

/**
 * Links an existing document to a task (document_links only — does not duplicate storage).
 */
export async function linkDocumentToTask(
  context: OrgContext,
  taskId: string,
  documentId: string,
  options: { label?: string | null; privacyClass?: 'standard' | 'compensation' | null } = {},
): Promise<DocumentLinkRecord> {
  await assertCanAccessTask(context, taskId);

  const link = await linkDocumentToEntity(context, {
    documentId,
    ownerType: 'task',
    ownerId: taskId,
    label: options.label ?? null,
    ...(options.privacyClass ? { privacyClass: options.privacyClass } : {}),
  });

  return link;
}

/**
 * Removes a document link from a task without deleting the underlying document.
 */
export async function unlinkDocumentFromTask(
  context: OrgContext,
  taskId: string,
  linkId: string,
): Promise<void> {
  await assertCanAccessTask(context, taskId);

  const link = await findDocumentLinkById(context.db, context.organizationId, linkId);
  if (!link || link.ownerType !== 'task' || link.ownerId !== taskId) {
    throw new NotFoundError('Document link');
  }

  const document = await findDocumentById(context.db, context.organizationId, link.documentId);

  await unlinkDocumentFromEntity(context, { linkId });

  await recordAttachmentActivity(context, taskId, 'attachment_removed', {
    documentId: link.documentId,
    linkId,
    filename: document?.originalFilename ?? null,
  });
}

/**
 * Records attachment_added after upload finalize (link already created during prepare).
 */
export async function recordTaskAttachmentAdded(
  context: OrgContext,
  taskId: string,
  documentId: string,
): Promise<void> {
  await assertCanAccessTask(context, taskId);

  if (!hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE)) {
    throw new ValidationError([{ path: 'permission', message: 'documents.manage required' }]);
  }

  const task = await findTaskById(context.db, context.organizationId, taskId);
  if (!task) throw new NotFoundError('Task');

  const link = (
    await listEntityDocuments(context, { ownerType: 'task', ownerId: taskId })
  ).find((row) => row.id === documentId);

  if (!link?.linkId) {
    throw new NotFoundError('Document link');
  }

  const document = await findDocumentById(context.db, context.organizationId, documentId);

  await recordAttachmentActivity(context, taskId, 'attachment_added', {
    documentId,
    linkId: link.linkId,
    filename: document?.originalFilename ?? null,
  });
}
