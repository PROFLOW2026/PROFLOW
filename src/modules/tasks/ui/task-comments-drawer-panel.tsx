'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Spinner } from '@/components/ui/spinner';
import {
  loadTaskCommentsPanelAction,
  type TaskCommentsPanelPayload,
} from './actions';
import {
  CommentActionsClient,
  CommentAttachmentsGallery,
  CommentFormClient,
} from './task-comments-client';
import {
  addTaskCommentAction,
  deleteTaskCommentAction,
  editTaskCommentAction,
} from './actions';

export function TaskCommentsDrawerPanel({ taskId }: { taskId: string }) {
  const t = useTranslations('tasks');
  const [data, setData] = useState<TaskCommentsPanelPayload | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const reload = useCallback(() => {
    startTransition(async () => {
      const result = await loadTaskCommentsPanelAction(taskId);
      if (result.error) {
        setLoadError(result.error);
        return;
      }
      setLoadError(null);
      setData(result);
    });
  }, [taskId]);

  useEffect(() => {
    reload();
  }, [reload]);

  if (pending && !data) {
    return (
      <div className="flex justify-center py-6">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (loadError) {
    return <p className="text-sm text-[var(--pf-status-danger-fg)]">{loadError}</p>;
  }

  if (!data) return null;

  return (
    <section aria-label={t('comments.sectionLabel')} className="flex flex-col gap-4 border-t border-[var(--pf-border-subtle)] pt-4">
      <h3 className="text-sm font-semibold text-[var(--pf-text-secondary)]">
        {t('comments.sectionLabel')}
        {data.comments.length > 0 ? (
          <span className="ms-1.5 text-[var(--pf-text-muted)]">({data.comments.length})</span>
        ) : null}
      </h3>

      {data.comments.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('comments.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-4 divide-y divide-[var(--pf-border-subtle)]">
          {data.comments.map((comment) =>
            comment.isDeleted ? (
              <li key={comment.id} className="py-2 text-sm italic text-[var(--pf-text-muted)]">
                {t('comments.deleted')}
              </li>
            ) : (
              <li key={comment.id} className="group flex flex-col gap-1">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex min-w-0 flex-col gap-0.5">
                    <span className="text-sm font-medium leading-snug">
                      {comment.authorName ?? t('comments.unknownAuthor')}
                    </span>
                    <time
                      dateTime={comment.createdAt}
                      className="text-xs text-[var(--pf-text-muted)]"
                    >
                      {new Intl.DateTimeFormat(undefined, {
                        dateStyle: 'medium',
                        timeStyle: 'short',
                      }).format(new Date(comment.createdAt))}
                      {comment.isEdited ? (
                        <span className="ms-1 text-[var(--pf-text-muted)]">
                          · {t('comments.edited')}
                        </span>
                      ) : null}
                    </time>
                  </div>

                  {!comment.isEmployee && comment.authorActorId === data.currentMembershipId ? (
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

                {comment.body ? (
                  <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                    {comment.body}
                  </p>
                ) : null}

                <CommentAttachmentsGallery attachments={comment.attachments} />
              </li>
            ),
          )}
        </ul>
      )}

      {data.canComment ? (
        <CommentFormClient
          taskId={taskId}
          projectId={data.projectId}
          canBrowseCloudFiles={data.canBrowseCloudFiles}
          action={async (prev, formData) => {
            const result = await addTaskCommentAction(prev, formData);
            if (!result.error) reload();
            return result;
          }}
          placeholderText={t('comments.placeholder')}
          submitLabel={t('comments.submit')}
        />
      ) : null}
    </section>
  );
}
