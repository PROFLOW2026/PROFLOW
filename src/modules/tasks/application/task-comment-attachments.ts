import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { findDocumentById } from '@/modules/documents';
import { linkDocumentToEntity } from '@/modules/documents/application/link-document';
import { finalizeDocumentUpload } from '@/modules/documents/application/manage-document';
import type { DocumentLinkRecord } from '@/modules/documents/domain/types';
import { createComment } from './create-task-comment';
import { linkProviderFileToTaskComment } from './task-provider-file-link';
import type { TaskComment } from '../domain/types';

/** Client-finalized upload waiting for server finalize (optional server-side path). */
export type TaskCommentPendingUpload = {
  readonly documentId: string;
  readonly sizeBytes: number;
};

/** Live cloud file selected from project storage (registered as document on link — no byte copy). */
export type TaskCommentProviderFileRef = {
  readonly projectId: string;
  readonly providerFileId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly parentFolderId: string;
};

/** @deprecated Prefer TaskCommentProviderFileRef — kept for registry document ids. */
export type TaskCommentCloudFileRef = {
  readonly documentId: string;
};

export type PublishTaskCommentInput = {
  readonly body?: string;
  readonly authorOrgMemberId?: string | null;
  readonly authorEmployeeId?: string | null;
  readonly pendingUploads?: readonly TaskCommentPendingUpload[];
  /** Client-side files queued for upload after comment creation (validation only). */
  readonly pendingUploadCount?: number;
  readonly linkDocumentIds?: readonly string[];
  readonly cloudFileRefs?: readonly TaskCommentCloudFileRef[];
  readonly providerFileRefs?: readonly TaskCommentProviderFileRef[];
};

export type PublishTaskCommentAttachmentFailure = {
  readonly documentId: string;
  readonly stage: 'link' | 'finalize';
  readonly message: string;
};

export type PublishTaskCommentResult = {
  readonly comment: TaskComment;
  readonly linkedDocumentIds: readonly string[];
  readonly finalizedDocumentIds: readonly string[];
  readonly failures: readonly PublishTaskCommentAttachmentFailure[];
};

function uniqueDocumentIds(ids: readonly string[]): string[] {
  return [...new Set(ids.filter(Boolean))];
}

function countAttachments(input: PublishTaskCommentInput): number {
  return (
    (input.pendingUploads?.length ?? 0) +
    (input.pendingUploadCount ?? 0) +
    (input.linkDocumentIds?.length ?? 0) +
    (input.cloudFileRefs?.length ?? 0) +
    (input.providerFileRefs?.length ?? 0)
  );
}

/**
 * Links existing documents to a task comment via document_links(owner_type = task_comment).
 * Partial failures are collected — successful links are kept.
 */
export async function linkDocumentsToTaskComment(
  context: OrgContext,
  commentId: string,
  documentIds: readonly string[],
): Promise<{ linked: string[]; failures: PublishTaskCommentAttachmentFailure[] }> {
  const linked: string[] = [];
  const failures: PublishTaskCommentAttachmentFailure[] = [];

  for (const documentId of uniqueDocumentIds(documentIds)) {
    try {
      const document = await findDocumentById(context.db, context.organizationId, documentId);
      if (!document || document.status === 'deleted') {
        failures.push({ documentId, stage: 'link', message: 'Document not found' });
        continue;
      }

      await linkDocumentToEntity(context, {
        documentId,
        ownerType: 'task_comment',
        ownerId: commentId,
      });
      linked.push(documentId);
    } catch (error) {
      failures.push({
        documentId,
        stage: 'link',
        message: error instanceof Error ? error.message : 'Link failed',
      });
    }
  }

  return { linked, failures };
}

/**
 * Creates a task comment and attaches documents (link existing / finalize pending uploads).
 * Requires non-empty body OR at least one attachment source.
 * Partial attachment failures do not roll back the comment or successful attachments.
 */
export async function publishTaskCommentWithAttachments(
  context: OrgContext,
  taskId: string,
  input: PublishTaskCommentInput,
): Promise<PublishTaskCommentResult> {
  const body = input.body?.trim() ?? '';
  const attachmentCount = countAttachments(input);

  if (!body && attachmentCount === 0) {
    throw new ValidationError([
      { path: 'body', message: 'Comment text or at least one attachment is required' },
    ]);
  }

  const comment = await createComment(context, taskId, {
    body,
    authorOrgMemberId: input.authorOrgMemberId,
    authorEmployeeId: input.authorEmployeeId,
    hasAttachments: attachmentCount > 0,
  });

  const linkedDocumentIds: string[] = [];
  const finalizedDocumentIds: string[] = [];
  const failures: PublishTaskCommentAttachmentFailure[] = [];

  const idsToLink = uniqueDocumentIds([
    ...(input.linkDocumentIds ?? []),
    ...(input.cloudFileRefs?.map((ref) => ref.documentId) ?? []),
  ]);

  if (idsToLink.length > 0) {
    const linkResult = await linkDocumentsToTaskComment(context, comment.id, idsToLink);
    linkedDocumentIds.push(...linkResult.linked);
    failures.push(...linkResult.failures);
  }

  for (const providerRef of input.providerFileRefs ?? []) {
    try {
      const linked = await linkProviderFileToTaskComment(context, taskId, comment.id, providerRef);
      linkedDocumentIds.push(linked.documentId);
    } catch (error) {
      failures.push({
        documentId: providerRef.providerFileId,
        stage: 'link',
        message: error instanceof Error ? error.message : 'Link failed',
      });
    }
  }

  for (const pending of input.pendingUploads ?? []) {
    try {
      await finalizeDocumentUpload(context, {
        documentId: pending.documentId,
        sizeBytes: pending.sizeBytes,
      });
      finalizedDocumentIds.push(pending.documentId);
    } catch (error) {
      failures.push({
        documentId: pending.documentId,
        stage: 'finalize',
        message: error instanceof Error ? error.message : 'Finalize failed',
      });
    }
  }

  return {
    comment,
    linkedDocumentIds,
    finalizedDocumentIds,
    failures,
  };
}

/** Validates comment exists before linking uploads from the client upload flow. */
export async function assertTaskCommentExists(
  context: OrgContext,
  commentId: string,
): Promise<DocumentLinkRecord['ownerId']> {
  assertPermission(context, PERMISSIONS.TASKS_COMMENT);
  const { findTaskCommentById } = await import('../data/tasks.repository');
  const comment = await findTaskCommentById(context.db, context.organizationId, commentId);
  if (!comment) throw new NotFoundError('Task comment');
  return comment.id;
}
