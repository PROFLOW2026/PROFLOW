/**
 * Task Comments — comment list + add-comment form.
 *
 * Data contract (until Agent A ships list-task-comments.ts):
 *   The server component fetches directly via Drizzle. Once Agent A exports
 *   `listTaskComments(context, taskId, opts)` from
 *   `@/modules/tasks/application/list-task-comments`, replace the inline
 *   queries with that call.
 *
 * Rendering rules:
 *   - Flat chronological list (no threading per plan).
 *   - Deleted comments → "[Comment removed]" placeholder.
 *   - Edited comments show an "edited" indicator.
 *   - Add-comment form visible to users with tasks.comment permission.
 *   - Edit / soft-delete actions on own comments only.
 *   - Load more: page through 20-comment pages.
 *   - RTL-compatible: logical CSS properties throughout.
 */

import { getTranslations } from 'next-intl/server';
import {
  loadTaskCommentsForDisplay,
  type TaskCommentDisplayRow,
} from '@/modules/tasks/application/load-task-comments-for-display';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Skeleton } from '@/components/ui/skeleton';
import {
  addTaskCommentAction,
  editTaskCommentAction,
  deleteTaskCommentAction,
} from './actions';
import { CommentFormClient, CommentActionsClient } from './task-comments-client';

// ─── Data Types ───────────────────────────────────────────────────────────────

export type TaskCommentRow = TaskCommentDisplayRow;

// ─── Data loading ─────────────────────────────────────────────────────────────

async function loadComments(
  taskId: string,
  beforeDate?: Date,
): Promise<{ comments: TaskCommentRow[]; hasMore: boolean; currentMembershipId: string | null }> {
  return loadTaskCommentsForDisplay(taskId, beforeDate);
}

// ─── Comment Item ──────────────────────────────────────────────────────────────

function DeletedCommentRow({ t }: { t: Awaited<ReturnType<typeof getTranslations<'tasks'>>> }) {
  return (
    <li className="py-2 text-sm italic text-[var(--pf-text-muted)]">
      {t('comments.deleted')}
    </li>
  );
}

function CommentRow({
  comment,
  taskId,
  isOwn,
  t,
}: {
  comment: TaskCommentRow;
  taskId: string;
  isOwn: boolean;
  t: Awaited<ReturnType<typeof getTranslations<'tasks'>>>;
}) {
  if (comment.isDeleted) return <DeletedCommentRow t={t} />;

  return (
    <li className="group flex flex-col gap-1">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-sm font-medium leading-snug">
            {comment.authorName ?? t('comments.unknownAuthor')}
          </span>
          <time
            dateTime={comment.createdAt.toISOString()}
            className="text-xs text-[var(--pf-text-muted)]"
          >
            {new Intl.DateTimeFormat(undefined, {
              dateStyle: 'medium',
              timeStyle: 'short',
            }).format(comment.createdAt)}
            {comment.isEdited ? (
              <span className="ms-1 text-[var(--pf-text-muted)]">· {t('comments.edited')}</span>
            ) : null}
          </time>
        </div>

        {isOwn ? (
          <CommentActionsClient
            commentId={comment.id}
            taskId={taskId}
            currentBody={comment.body}
            editAction={editTaskCommentAction}
            deleteAction={deleteTaskCommentAction}
            labelEdit={t('comments.edit')}
            labelDelete={t('comments.delete')}
            labelSave={t('comments.save')}
            labelCancel={t('comments.cancel')}
          />
        ) : null}
      </div>

      <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
        {comment.body}
      </p>
    </li>
  );
}

// ─── Add Comment Form ──────────────────────────────────────────────────────────

function AddCommentForm({
  taskId,
  t,
}: {
  taskId: string;
  t: Awaited<ReturnType<typeof getTranslations<'tasks'>>>;
}) {
  return (
    <CommentFormClient
      taskId={taskId}
      action={addTaskCommentAction}
      placeholderText={t('comments.placeholder')}
      submitLabel={t('comments.submit')}
    />
  );
}

// ─── Main Server Component ─────────────────────────────────────────────────────

interface TaskCommentsProps {
  taskId: string;
}

export async function TaskComments({ taskId }: TaskCommentsProps) {
  const t = await getTranslations('tasks');

  const { comments, hasMore, currentMembershipId } = await loadComments(taskId);

  const canComment = await withOrgContext(async (context) =>
    hasPermission(context, PERMISSIONS.TASKS_COMMENT),
  );

  return (
    <section aria-label={t('comments.sectionLabel')} className="flex flex-col gap-4">
      <h3 className="text-sm font-semibold text-[var(--pf-text-secondary)]">
        {t('comments.sectionLabel')}
        {comments.length > 0 ? (
          <span className="ms-1.5 text-[var(--pf-text-muted)]">({comments.length})</span>
        ) : null}
      </h3>

      {comments.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('comments.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4 divide-y divide-[var(--pf-border-subtle)]">
          {comments.map((comment) => (
            <CommentRow
              key={comment.id}
              comment={comment}
              taskId={taskId}
              isOwn={
                !comment.isEmployee &&
                comment.authorActorId === currentMembershipId
              }
              t={t}
            />
          ))}
        </ul>
      )}

      {hasMore ? (
        <p className="text-sm text-[var(--pf-text-muted)]">
          {t('comments.loadMore')}
        </p>
      ) : null}

      {canComment ? <AddCommentForm taskId={taskId} t={t} /> : null}
    </section>
  );
}

export function TaskCommentsSkeleton() {
  return (
    <section className="flex flex-col gap-4">
      <Skeleton className="h-4 w-24" />
      <div className="flex flex-col gap-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <Skeleton className="h-3 w-28" />
            <Skeleton className="h-12 w-full" />
          </div>
        ))}
      </div>
      <Skeleton className="h-20 w-full" />
    </section>
  );
}
