import 'server-only';

import type { OrgContext } from '@/shared/auth/context';
import { linkDocumentToEntity } from '@/modules/documents/application/link-document';
import type { DocumentLinkRecord } from '@/modules/documents/domain/types';
import {
  ensureDocumentForProviderFile,
  type EnsureDocumentForProviderFileInput,
} from '@/modules/external-storage/application/link-provider-file-to-document';
import { assertCanAccessTask } from './assert-task-access';
import { recordTaskAttachmentEvent } from './task-attachments';
import { assertTaskCommentExists } from './task-comment-attachments';

export type ProviderFileLinkInput = Pick<
  EnsureDocumentForProviderFileInput,
  'projectId' | 'providerFileId' | 'fileName' | 'mimeType' | 'parentFolderId' | 'semanticFolderType'
> & {
  readonly label?: string | null;
  readonly privacyClass?: 'standard' | 'compensation' | null;
};

export type ProviderFileLinkResult = {
  readonly documentId: string;
  readonly linkId: string;
};

/**
 * Registers a live cloud file as a document (if needed) and links it to a task.
 * No byte copy — the provider file remains the storage source of truth.
 */
export async function linkProviderFileToTask(
  context: OrgContext,
  taskId: string,
  input: ProviderFileLinkInput,
): Promise<ProviderFileLinkResult> {
  await assertCanAccessTask(context, taskId);

  const document = await ensureDocumentForProviderFile(context, input);
  const link = await linkDocumentToEntity(context, {
    documentId: document.id,
    ownerType: 'task',
    ownerId: taskId,
    label: input.label ?? null,
    ...(input.privacyClass ? { privacyClass: input.privacyClass } : {}),
  });

  await recordTaskAttachmentEvent(context, taskId, 'attachment_added', {
    documentId: document.id,
    linkId: link.id,
    filename: document.originalFilename,
  });

  return { documentId: document.id, linkId: link.id };
}

/**
 * Registers a live cloud file as a document (if needed) and links it to a task comment.
 */
export async function linkProviderFileToTaskComment(
  context: OrgContext,
  taskId: string,
  commentId: string,
  input: Omit<ProviderFileLinkInput, 'label' | 'privacyClass'>,
): Promise<ProviderFileLinkResult> {
  await assertCanAccessTask(context, taskId);
  await assertTaskCommentExists(context, commentId);

  const document = await ensureDocumentForProviderFile(context, input);
  const link: DocumentLinkRecord = await linkDocumentToEntity(context, {
    documentId: document.id,
    ownerType: 'task_comment',
    ownerId: commentId,
  });

  return { documentId: document.id, linkId: link.id };
}
