import { notFound } from 'next/navigation';
import { getLocale, getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { getEmployeePmTaskDetail } from '@/modules/employee-app/application/employee-pm-tasks';
import { employeePermissionScope } from '@/modules/employee-app/application/load-employee-app-context';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { Link } from '@/shared/i18n/navigation';
import { NotFoundError } from '@/shared/errors';
import {
  employeeUpdateTaskStatusAction,
  employeeToggleChecklistItemAction,
  employeeAddTaskCommentAction,
} from '../actions';
import { cn } from '@/shared/ui/cn';

const TASK_STATUSES = [
  'todo',
  'in_progress',
  'in_review',
  'done',
  'blocked',
  'cancelled',
] as const;

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-[var(--pf-surface-2)] text-[var(--pf-text-secondary)]',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-[var(--pf-surface-2)] text-[var(--pf-text-muted)]',
  blocked: 'bg-red-100 text-red-700',
};

const PRIORITY_BADGES: Record<string, string> = {
  low: 'bg-slate-100 text-slate-600',
  medium: 'bg-yellow-100 text-yellow-700',
  high: 'bg-orange-100 text-orange-700',
  urgent: 'bg-red-100 text-red-700',
};

interface PageProps {
  params: Promise<{ taskId: string; locale: string }>;
}

export default async function EmployeePmTaskDetailPage({ params }: PageProps) {
  const { taskId } = await params;
  const locale = await getLocale();
  const t = await getTranslations('employeeApp.tasks');

  let task: Awaited<ReturnType<typeof getEmployeePmTaskDetail>>;
  let canUpdate = false;
  let canComment = false;

  try {
    const result = await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      const detail = await getEmployeePmTaskDetail(context, taskId);
      const updateScope = employeePermissionScope(context, PERMISSIONS.TASKS_UPDATE);
      const commentScope = employeePermissionScope(context, PERMISSIONS.TASKS_COMMENT);
      return {
        task: detail,
        canUpdate: updateScope !== null,
        canComment: commentScope !== null,
      };
    });
    task = result.task;
    canUpdate = result.canUpdate;
    canComment = result.canComment;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS.todo;
  const addCommentForTask = employeeAddTaskCommentAction.bind(null, taskId);

  return (
    <div className="space-y-5 pb-8">
      <Link
        href={`/${locale}/employee/tasks`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        {t('backToTasks')}
      </Link>

      <div className="space-y-3 rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] p-4">
        <h1 className="text-base font-semibold leading-snug">{task.title}</h1>
        <div className="flex flex-wrap gap-2">
          <span className={cn('inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium', statusColor)}>
            {t(`status.${task.status}`, { defaultValue: task.status })}
          </span>
          {task.priority && task.priority !== 'none' ? (
            <span
              className={cn(
                'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
                PRIORITY_BADGES[task.priority] ?? '',
              )}
            >
              {t(`priority.${task.priority}`, { defaultValue: task.priority })}
            </span>
          ) : null}
          {task.dueDate ? (
            <span className="inline-flex items-center rounded-full bg-[var(--pf-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--pf-text-secondary)]">
              {t('dueDate', { date: task.dueDate })}
            </span>
          ) : null}
        </div>
        {task.description ? (
          <p className="whitespace-pre-line text-sm leading-relaxed text-[var(--pf-text-secondary)]">
            {task.description}
          </p>
        ) : null}
      </div>

      {canUpdate ? (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {t('updateStatus')}
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {TASK_STATUSES.map((status) => {
              const isActive = status === task.status;
              const updateWithStatus = updateEmployeeTaskStatus.bind(null, taskId, status);
              return (
                <form key={status} action={updateWithStatus}>
                  <button
                    type="submit"
                    disabled={isActive}
                    className={cn(
                      'min-h-[44px] w-full rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors',
                      isActive
                        ? 'cursor-default border-[var(--pf-primary)] bg-[var(--pf-primary)] text-white'
                        : 'border-[var(--pf-border)] bg-[var(--pf-surface)] text-[var(--pf-text)] hover:bg-[var(--pf-surface-2)] active:bg-[var(--pf-surface-3)]',
                    )}
                  >
                    {t(`status.${status}`, { defaultValue: status })}
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      ) : null}

      {task.checklistItems.length > 0 ? (
        <section className="space-y-2">
          <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
            {t('checklistTitle', {
              done: task.checklistItems.filter((item) => item.isDone).length,
              total: task.checklistItems.length,
            })}
          </h2>
          <ul className="divide-y divide-[var(--pf-border)] rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)]">
            {task.checklistItems.map((item) => {
              if (!canUpdate) {
                return (
                  <li key={item.id} className="flex min-h-[52px] items-center gap-3 px-4 py-3">
                    <ChecklistMark done={item.isDone} />
                    <span className={cn('flex-1 text-sm', item.isDone && 'line-through text-[var(--pf-text-muted)]')}>
                      {item.title}
                    </span>
                  </li>
                );
              }
              const toggleAction = toggleChecklistItem.bind(null, taskId, item.id, !item.isDone);
              return (
                <li key={item.id} className="min-h-[52px]">
                  <form action={toggleAction}>
                    <button
                      type="submit"
                      className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-[var(--pf-surface-2)] active:bg-[var(--pf-surface-3)]"
                    >
                      <ChecklistMark done={item.isDone} />
                      <span className={cn('flex-1 text-sm', item.isDone && 'line-through text-[var(--pf-text-muted)]')}>
                        {item.title}
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section className="space-y-3">
        <h2 className="px-1 text-sm font-semibold uppercase tracking-wide text-[var(--pf-text-secondary)]">
          {t('commentsTitle')}
        </h2>
        {task.comments.length > 0 ? (
          <ul className="space-y-2">
            {task.comments.map((comment) => (
              <li
                key={comment.id}
                className="space-y-1 rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3"
              >
                <p className="whitespace-pre-line text-sm leading-relaxed">{comment.body}</p>
                <div className="flex items-center gap-2 text-xs text-[var(--pf-text-muted)]">
                  <span>
                    {new Date(comment.createdAt).toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {comment.isEdited ? <span>{t('commentEdited')}</span> : null}
                  {comment.authorEmployeeId ? (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs text-blue-600">
                      {t('commentAuthorEmployee')}
                    </span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="py-3 text-center text-sm text-[var(--pf-text-muted)]">{t('noComments')}</p>
        )}
        {canComment ? (
          <AddCommentForm
            addComment={addCommentForTask}
            placeholder={t('commentPlaceholder')}
            submitLabel={t('postComment')}
          />
        ) : null}
      </section>
    </div>
  );
}

function ChecklistMark({ done }: { done: boolean }) {
  return (
    <span
      className={cn(
        'flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-xs',
        done ? 'border-green-500 bg-green-500 text-white' : 'border-[var(--pf-border)] bg-[var(--pf-surface)]',
      )}
    >
      {done ? '✓' : null}
    </span>
  );
}

async function updateEmployeeTaskStatus(taskId: string, newStatus: string) {
  'use server';
  await employeeUpdateTaskStatusAction(taskId, newStatus);
}

async function toggleChecklistItem(taskId: string, itemId: string, isDone: boolean) {
  'use server';
  await employeeToggleChecklistItemAction(taskId, itemId, isDone);
}

function AddCommentForm({
  addComment,
  placeholder,
  submitLabel,
}: {
  addComment: (formData: FormData) => Promise<void>;
  placeholder: string;
  submitLabel: string;
}) {
  return (
    <form action={addComment} className="space-y-2">
      <textarea
        name="body"
        rows={3}
        placeholder={placeholder}
        required
        className="w-full resize-none rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 text-sm placeholder:text-[var(--pf-text-muted)] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[var(--pf-primary)]"
      />
      <button
        type="submit"
        className="min-h-[48px] w-full rounded-xl bg-[var(--pf-primary)] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[var(--pf-primary-hover)] active:bg-[var(--pf-primary-active)]"
      >
        {submitLabel}
      </button>
    </form>
  );
}
