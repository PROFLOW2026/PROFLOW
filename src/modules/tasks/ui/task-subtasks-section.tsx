'use client';

import { ChevronRight, ListTree, Loader2, Plus } from 'lucide-react';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import type { TaskLinkUi, TaskSubtaskUi } from './_task-api-stub';

interface TaskSubtasksSectionProps {
  taskId: string;
  parentTask: TaskLinkUi | null;
  subtasks: TaskSubtaskUi[];
  canAddSubtask: boolean;
  onRefresh: () => void | Promise<void>;
  onCreateSubtask: (
    parentTaskId: string,
    input: { title: string; dueDate?: string | null },
  ) => Promise<{ success?: boolean; error?: string; subtaskId?: string }>;
}

export function TaskSubtasksSection({
  taskId,
  parentTask,
  subtasks,
  canAddSubtask,
  onRefresh,
  onCreateSubtask,
}: TaskSubtasksSectionProps) {
  const t = useTranslations('tasks');
  const [isPending, startTransition] = useTransition();
  const [showForm, setShowForm] = useState(false);
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleCreate = () => {
    const trimmed = title.trim();
    if (!trimmed) return;

    startTransition(() => {
      void (async () => {
        setError(null);
        const result = await onCreateSubtask(taskId, {
          title: trimmed,
          dueDate: dueDate || null,
        });
        if (result.error) {
          setError(result.error);
          return;
        }
        setTitle('');
        setDueDate('');
        setShowForm(false);
        await onRefresh();
      })();
    });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <ListTree aria-hidden className="size-4 text-[var(--pf-text-muted)]" />
        <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
          {t('task.subtasks')}
        </p>
      </div>

      {parentTask ? (
        <div className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] px-3 py-2">
          <p className="text-xs text-[var(--pf-text-muted)]">{t('subtasks.parentLabel')}</p>
          <Link
            href={`/tasks/${parentTask.id}`}
            className="mt-0.5 inline-flex items-center gap-1 text-sm font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
          >
            {parentTask.title}
            <ChevronRight className="size-3 rtl:rotate-180" aria-hidden />
          </Link>
        </div>
      ) : null}

      {subtasks.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('subtasks.empty')}</p>
      ) : (
        <ul className="flex flex-col gap-1.5">
          {subtasks.map((subtask) => (
            <li
              key={subtask.id}
              className="flex items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-2.5 py-1.5"
            >
              <Link
                href={`/tasks/${subtask.id}`}
                className="min-w-0 truncate text-sm font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
              >
                {subtask.title}
              </Link>
              <div className="flex shrink-0 items-center gap-1.5">
                {subtask.dueDate ? (
                  <span className="text-xs text-[var(--pf-text-muted)]">{subtask.dueDate}</span>
                ) : null}
                <Badge tone="neutral" className="text-[0.625rem]">
                  {t(`status.${subtask.status}`)}
                </Badge>
              </div>
            </li>
          ))}
        </ul>
      )}

      {canAddSubtask ? (
        <div>
          {showForm ? (
            <div className="flex flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] p-3">
              <input
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder={t('subtasks.titlePlaceholder')}
                className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm"
              />
              <input
                type="date"
                value={dueDate}
                onChange={(event) => setDueDate(event.target.value)}
                aria-label={t('dueDateLabel')}
                className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={isPending || !title.trim()}
                  onClick={handleCreate}
                  className="inline-flex items-center gap-1 rounded-md bg-[var(--pf-action-primary)] px-3 py-1.5 text-sm font-medium text-[var(--pf-action-primary-fg)] disabled:opacity-50"
                >
                  {isPending ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {t('subtasks.create')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowForm(false);
                    setError(null);
                  }}
                  className="text-sm text-[var(--pf-text-secondary)]"
                >
                  {t('cancel')}
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-1 text-sm font-medium text-[var(--pf-text-brand)]"
            >
              <Plus className="size-3.5" aria-hidden />
              {t('subtasks.add')}
            </button>
          )}
        </div>
      ) : null}

      {error ? <p className="text-sm text-[var(--pf-status-danger-fg)]">{error}</p> : null}
    </div>
  );
}
