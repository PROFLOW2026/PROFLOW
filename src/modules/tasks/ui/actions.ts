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
  submitApprovalRequest,
  decideApprovalRequest,
} from '@/modules/approvals';

export interface TaskActionState {
  ok?: boolean;
  error?: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fv(formData: FormData, key: string): string | undefined {
  const v = formData.get(key);
  if (v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s;
}

function revalidateTask(taskId: string) {
  revalidatePath(`/tasks/${taskId}`);
}

// ─── Comments ────────────────────────────────────────────────────────────────

export async function addTaskCommentAction(
  _prev: TaskActionState,
  formData: FormData,
): Promise<TaskActionState> {
  const tErrors = await getTranslations('errors');
  const taskId = fv(formData, 'taskId');
  const body = fv(formData, 'body');

  if (!taskId || !body) {
    return { error: tErrors('validationFailed') };
  }
  if (body.length > 20_000) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext(async (context) => {
      assertPermission(context, PERMISSIONS.TASKS_COMMENT);

      await context.db.insert(taskComments).values({
        taskId,
        organizationId: context.organizationId,
        authorOrgMemberId: context.membershipId,
        authorEmployeeId: null,
        body,
      });
    });

    revalidateTask(taskId);
    return { ok: true };
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
