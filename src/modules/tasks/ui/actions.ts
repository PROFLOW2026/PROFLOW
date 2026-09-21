'use server';

/**
 * Task UI server actions.
 *
 * Covers: comment CRUD, request-task-approval, and approval decisions for tasks.
 *
 * Data layer notes:
 * - Comment mutations write directly via Drizzle until Agent A ships
 *   `src/modules/tasks/application/comment.ts`.
 * - Approval mutations delegate to the existing approvals module.
 */

import { and, eq } from 'drizzle-orm';
import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { taskComments } from '@drizzle/schema';
import { serializeError } from '@/shared/errors';
import { withOrgContext } from '@/shared/auth/session';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  publishTaskCommentWithAttachments,
  recordTaskApprovalActivity,
} from '@/modules/tasks';
import {
  submitApprovalRequest,
  decideApprovalRequest,
} from '@/modules/approvals';
import type { TaskCommentAttachmentDisplay } from '@/modules/tasks/application/load-task-comments-for-display';

export interface TaskActionState {
  ok?: boolean;
  error?: string;
  commentId?: string;
  partialError?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fv(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function parseIdList(raw: string | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((value): value is string => typeof value === 'string' && value.trim() !== '');
    }
  } catch {
    // fall through to comma-separated
  }
  return raw
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
}

const MAX_COMMENT_ATTACHMENTS = 5;

function revalidateTask(taskId: string) {
  revalidatePath(`/tasks/${taskId}`);
  revalidatePath(`/employee/tasks/${taskId}`);
}

export type TaskCommentsPanelPayload = {
  comments: Array<{
    id: string;
    body: string;
    isEdited: boolean;
    isDeleted: boolean;
    createdAt: string;
    authorName: string | null;
    authorActorId: string | null;
    isEmployee: boolean;
    attachments: readonly TaskCommentAttachmentDisplay[];
  }>;
  canComment: boolean;
  projectId: string | null;
  canBrowseCloudFiles: boolean;
  currentMembershipId: string | null;
  error?: string;
};

export async function loadTaskCommentsPanelAction(
  taskId: string,
): Promise<TaskCommentsPanelPayload> {
  const tErrors = await getTranslations('errors');
  try {
    const { loadTaskCommentsForDisplayWithContext } = await import(
      '@/modules/tasks/application/load-task-comments-for-display'
    );
    const { findTaskById } = await import('@/modules/tasks');
    const { isStorageConfigured } = await import('@/modules/documents/application/upload-document');

    return await withOrgContext(async (context) => {
      const [{ comments, currentMembershipId }, task, storageConfigured] = await Promise.all([
        loadTaskCommentsForDisplayWithContext(context, taskId),
        findTaskById(context.db, context.organizationId, taskId),
        isStorageConfigured(context),
      ]);

      return {
        comments: comments.map((comment) => ({
          id: comment.id,
          body: comment.body,
          isEdited: comment.isEdited,
          isDeleted: comment.isDeleted,
          createdAt: comment.createdAt.toISOString(),
          authorName: comment.authorName,
          authorActorId: comment.authorActorId,
          isEmployee: comment.isEmployee,
          attachments: [...comment.attachments],
        })),
        canComment: hasPermission(context, PERMISSIONS.TASKS_COMMENT),
        projectId: task?.projectId ?? null,
        canBrowseCloudFiles:
          hasPermission(context, PERMISSIONS.DOCUMENTS_MANAGE) &&
          Boolean(task?.projectId) &&
          storageConfigured,
        currentMembershipId,
      };
    });
  } catch {
    return {
      comments: [],
      canComment: false,
      projectId: null,
      canBrowseCloudFiles: false,
      currentMembershipId: null,
      error: tErrors('unexpected'),
    };
  }
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function addTaskCommentAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const tErrors = await getTranslations('errors');
  const tComments = await getTranslations('tasks.comments.attachments');
  const taskId = fv(formData, 'taskId');
  const body = fv(formData, 'body') ?? '';
  const pendingAttachmentCount = Number(fv(formData, 'pendingAttachmentCount') ?? '0');
  const linkDocumentIds = parseIdList(fv(formData, 'linkDocumentIds'));
  const cloudFileRefs = parseIdList(fv(formData, 'cloudFileRefs')).map((documentId) => ({
    documentId,
  }));
  let providerFileRefs: Array<{
    projectId: string;
    providerFileId: string;
    fileName: string;
    mimeType: string;
    parentFolderId: string;
  }> = [];
  const providerFileRefsRaw = fv(formData, 'providerFileRefs');
  if (providerFileRefsRaw) {
    try {
      const parsed = JSON.parse(providerFileRefsRaw) as unknown;
      if (Array.isArray(parsed)) {
        providerFileRefs = parsed.filter(
          (item): item is (typeof providerFileRefs)[number] =>
            typeof item === 'object' &&
            item !== null &&
            typeof (item as { projectId?: string }).projectId === 'string' &&
            typeof (item as { providerFileId?: string }).providerFileId === 'string' &&
            typeof (item as { fileName?: string }).fileName === 'string' &&
            typeof (item as { mimeType?: string }).mimeType === 'string' &&
            typeof (item as { parentFolderId?: string }).parentFolderId === 'string',
        );
      }
    } catch {
      providerFileRefs = [];
    }
  }

  if (!taskId) {
    return { error: tErrors('validationFailed') };
  }
  if (
    !body &&
    pendingAttachmentCount <= 0 &&
    linkDocumentIds.length === 0 &&
    cloudFileRefs.length === 0 &&
    providerFileRefs.length === 0
  ) {
    return { error: tErrors('validationFailed') };
  }
  if (body.length > 20_000) {
    return { error: tErrors('validationFailed') };
  }
  const totalAttachments =
    pendingAttachmentCount + linkDocumentIds.length + cloudFileRefs.length + providerFileRefs.length;
  if (totalAttachments > MAX_COMMENT_ATTACHMENTS) {
    return { error: tComments('maxReached', { max: MAX_COMMENT_ATTACHMENTS }) };
  }

  try {
    const result = await withOrgContext(async (context) =>
      publishTaskCommentWithAttachments(context, taskId, {
        body,
        linkDocumentIds,
        cloudFileRefs,
        providerFileRefs,
        pendingUploadCount: pendingAttachmentCount,
      }),
    );

    revalidateTask(taskId);

    const partialError =
      result.failures.length > 0
        ? tComments('partialSuccess', { count: result.failures.length })
        : undefined;

    return {
      ok: true,
      commentId: result.comment.id,
      partialError,
    };
  } catch (error) {
    const serialized = serializeError(error);
    return { error: tErrors(serialized.messageKey.replace(/^errors\./, '') as 'notAllowed') };
  }
}

export async function editTaskCommentAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const tErrors = await getTranslations('errors');
  const taskId = fv(formData, 'taskId');
  const commentId = fv(formData, 'commentId');
  const body = fv(formData, 'body');

  if (!taskId || !commentId || !body) {
    return { error: tErrors('validationFailed') };
  }
  if (body.length > 20_000) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASKS_COMMENT);

      // Only the author (by membershipId) may edit their own comment.
      const updated = await context.db
        .update(taskComments)
        .set({ body, isEdited: true, editedAt: new Date() })
        .where(
          and(
            eq(taskComments.id, commentId),
            eq(taskComments.organizationId, context.organizationId),
            eq(taskComments.authorOrgMemberId, context.membershipId),
            eq(taskComments.isDeleted, false),
          ),
        )
        .returning({ id: taskComments.id });

      if (updated.length === 0) {
        throw new Error('not_found_or_not_owner');
      }
    });

    revalidateTask(taskId);
    return { ok: true };
  } catch (error) {
    const serialized = serializeError(error);
    return { error: tErrors(serialized.messageKey.replace(/^errors\./, '') as 'notAllowed') };
  }
}

export async function deleteTaskCommentAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const tErrors = await getTranslations('errors');
  const taskId = fv(formData, 'taskId');
  const commentId = fv(formData, 'commentId');

  if (!taskId || !commentId) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASKS_COMMENT);

      // Soft-delete: only the comment author may delete their own.
      const updated = await context.db
        .update(taskComments)
        .set({ isDeleted: true, deletedAt: new Date() })
        .where(
          and(
            eq(taskComments.id, commentId),
            eq(taskComments.organizationId, context.organizationId),
            eq(taskComments.authorOrgMemberId, context.membershipId),
            eq(taskComments.isDeleted, false),
          ),
        )
        .returning({ id: taskComments.id });

      if (updated.length === 0) {
        throw new Error('not_found_or_not_owner');
      }
    });

    revalidateTask(taskId);
    return { ok: true };
  } catch (error) {
    const serialized = serializeError(error);
    return { error: tErrors(serialized.messageKey.replace(/^errors\./, '') as 'notAllowed') };
  }
}

// ─── Approval ────────────────────────────────────────────────────────────────

export async function requestTaskApprovalAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('approvals');
  const taskId = fv(formData, 'taskId');

  if (!taskId) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASKS_UPDATE);

      const result = await submitApprovalRequest(context, {
        entityType: 'task',
        entityId: taskId,
        requireMatchingRule: false, // tasks can request approval without a rule
      });

      if (result.kind === 'already_open') {
        // Already pending — not an error, just no-op.
      }
    });

    revalidateTask(taskId);
    return { ok: true };
  } catch (error) {
    const serialized = serializeError(error);
    if (serialized.messageKey.startsWith('approvals.')) {
      return { error: t(serialized.messageKey.replace('approvals.', '') as 'errors.pending') };
    }
    return { error: tErrors(serialized.messageKey.replace(/^errors\./, '') as 'notAllowed') };
  }
}

export async function decideTaskApprovalAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const t = await getTranslations('approvals');
  const tErrors = await getTranslations('errors');
  const taskId = fv(formData, 'taskId');
  const requestId = fv(formData, 'requestId');
  const decision = fv(formData, 'decision');

  if (!taskId || !requestId || (decision !== 'approved' && decision !== 'rejected')) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext(async (context) => {
      // tasks.approve overrides the generic approvals.decide check inside decideApprovalRequest.
      if (!hasPermission(context, PERMISSIONS.TASKS_APPROVE) &&
          !hasPermission(context, PERMISSIONS.APPROVALS_DECIDE)) {
        assertPermission(context, PERMISSIONS.TASKS_APPROVE);
      }

      await decideApprovalRequest(context, {
        requestId,
        decision,
        decisionNote: fv(formData, 'decisionNote') ?? null,
      });

      await recordTaskApprovalActivity(context, taskId, { decision, requestId });
    });

    revalidateTask(taskId);
    revalidatePath('/approvals');
    return { ok: true };
  } catch (error) {
    const serialized = serializeError(error);
    if (serialized.messageKey.startsWith('approvals.')) {
      return { error: t(serialized.messageKey.replace(/^approvals\./, '') as 'errors.pending') };
    }
    return { error: tErrors(serialized.messageKey.replace(/^errors\./, '') as 'notAllowed') };
  }
}
