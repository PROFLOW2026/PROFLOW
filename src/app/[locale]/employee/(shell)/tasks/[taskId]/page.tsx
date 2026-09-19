import { notFound } from 'next/navigation';
import { getLocale } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import {
  getEmployeePmTaskDetail,
} from '@/modules/employee-app/application/employee-pm-tasks';
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

// ─── Status config ────────────────────────────────────────────────────────────

const TASK_STATUSES = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-[var(--pf-surface-2)] text-[var(--pf-text-secondary)]',
  in_progress: 'bg-blue-100 text-blue-700',
  in_review: 'bg-purple-100 text-purple-700',
  done: 'bg-green-100 text-green-700',
  cancelled: 'bg-[var(--pf-surface-2)] text-[var(--pf-text-muted)]',
  blocked: 'bg-red-100 text-red-700',
};

const PRIORITY_BADGES: Record<string, { label: string; className: string }> = {
  none: { label: '', className: '' },
  low: { label: 'Low', className: 'bg-slate-100 text-slate-600' },
  medium: { label: 'Medium', className: 'bg-yellow-100 text-yellow-700' },
  high: { label: 'High', className: 'bg-orange-100 text-orange-700' },
  urgent: { label: 'Urgent', className: 'bg-red-100 text-red-700' },
};

// ─── Page ─────────────────────────────────────────────────────────────────────

interface PageProps {
  params: Promise<{ taskId: string; locale: string }>;
}

export default async function EmployeePmTaskDetailPage({ params }: PageProps) {
  const { taskId } = await params;
  const locale = await getLocale();

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

  const priorityBadge = PRIORITY_BADGES[task.priority] ?? PRIORITY_BADGES['none'];
  const statusColor = STATUS_COLORS[task.status] ?? STATUS_COLORS['todo'];

  // Bound server actions — taskId is closed over
  const addCommentForTask = employeeAddTaskCommentAction.bind(null, taskId);

  return (
    <div className="space-y-5 pb-8">
      {/* ── Back navigation ── */}
      <Link
        href={`/${locale}/employee/tasks`}
        className="inline-flex items-center gap-1.5 text-sm text-[var(--pf-text-secondary)] hover:text-[var(--pf-text)]"
      >
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back to Tasks
      </Link>

      {/* ── Task header ── */}
      <div className="rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] p-4 space-y-3">
        <h1 className="text-base font-semibold leading-snug">{task.title}</h1>

        <div className="flex flex-wrap gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${statusColor}`}>
            {TASK_STATUSES.find((s) => s.value === task.status)?.label ?? task.status}
          </span>
          {task.priority && task.priority !== 'none' && priorityBadge && priorityBadge.label && (
            <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${priorityBadge.className}`}>
              {priorityBadge.label}
            </span>
          )}
          {task.dueDate && (
            <span className="inline-flex items-center rounded-full bg-[var(--pf-surface-2)] px-2.5 py-1 text-xs font-medium text-[var(--pf-text-secondary)]">
              Due {task.dueDate}
            </span>
          )}
        </div>

        {task.description && (
          <p className="text-sm text-[var(--pf-text-secondary)] whitespace-pre-line leading-relaxed">
            {task.description}
          </p>
        )}
      </div>

      {/* ── Status update (if canUpdate) ── */}
      {canUpdate && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--pf-text-secondary)] uppercase tracking-wide px-1">
            Update Status
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {TASK_STATUSES.map((s) => {
              const isActive = s.value === task.status;
              const updateWithStatus = updateEmployeeTaskStatus.bind(null, taskId, s.value);
              return (
                <form key={s.value} action={updateWithStatus}>
                  <button
                    type="submit"
                    disabled={isActive}
                    className={`w-full rounded-lg border px-3 py-2.5 text-sm font-medium transition-colors min-h-[44px] ${
                      isActive
                        ? 'border-[var(--pf-primary)] bg-[var(--pf-primary)] text-white cursor-default'
                        : 'border-[var(--pf-border)] bg-[var(--pf-surface)] text-[var(--pf-text)] hover:bg-[var(--pf-surface-2)] active:bg-[var(--pf-surface-3)]'
                    }`}
                  >
                    {s.label}
                  </button>
                </form>
              );
            })}
          </div>
        </section>
      )}

      {/* ── Checklist ── */}
      {task.checklistItems.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-sm font-semibold text-[var(--pf-text-secondary)] uppercase tracking-wide px-1">
            Checklist{' '}
            <span className="font-normal">
              ({task.checklistItems.filter((i) => i.isDone).length}/{task.checklistItems.length})
            </span>
          </h2>
          <ul className="divide-y divide-[var(--pf-border)] rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)]">
            {task.checklistItems.map((item) => {
              if (!canUpdate) {
                return (
                  <li key={item.id} className="flex items-center gap-3 px-4 py-3 min-h-[52px]">
                    <span
                      className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-xs ${
                        item.isDone
                          ? 'border-green-500 bg-green-500 text-white'
                          : 'border-[var(--pf-border)] bg-[var(--pf-surface)]'
                      }`}
                    >
                      {item.isDone && '✓'}
                    </span>
                    <span className={`text-sm flex-1 ${item.isDone ? 'line-through text-[var(--pf-text-muted)]' : ''}`}>
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
                      className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[var(--pf-surface-2)] transition-colors active:bg-[var(--pf-surface-3)]"
                    >
                      <span
                        className={`flex h-5 w-5 flex-shrink-0 items-center justify-center rounded border text-xs ${
                          item.isDone
                            ? 'border-green-500 bg-green-500 text-white'
                            : 'border-[var(--pf-border)] bg-[var(--pf-surface)]'
                        }`}
                      >
                        {item.isDone && '✓'}
                      </span>
                      <span className={`text-sm flex-1 ${item.isDone ? 'line-through text-[var(--pf-text-muted)]' : ''}`}>
                        {item.title}
                      </span>
                    </button>
                  </form>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {/* ── Comments ── */}
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-[var(--pf-text-secondary)] uppercase tracking-wide px-1">
          Comments
        </h2>

        {task.comments.length > 0 && (
          <ul className="space-y-2">
            {task.comments.map((comment) => (
              <li
                key={comment.id}
                className="rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 space-y-1"
              >
                <p className="text-sm leading-relaxed whitespace-pre-line">{comment.body}</p>
                <div className="flex items-center gap-2 text-xs text-[var(--pf-text-muted)]">
                  <span>
                    {new Date(comment.createdAt).toLocaleDateString(locale, {
                      day: 'numeric',
                      month: 'short',
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>
                  {comment.isEdited && <span>(edited)</span>}
                  {comment.authorEmployeeId && (
                    <span className="rounded bg-blue-50 px-1.5 py-0.5 text-blue-600 text-xs">
                      Employee
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}

        {task.comments.length === 0 && (
          <p className="text-sm text-center text-[var(--pf-text-muted)] py-3">No comments yet</p>
        )}

        {/* Add comment form — only if canComment */}
        {canComment && (
          <AddCommentForm addComment={addCommentForTask} />
        )}
      </section>
    </div>
  );
}

// ─── Inline Server Action wrappers ───────────────────────────────────────────
// These are inline server actions that close over taskId/itemId/isDone
// and delegate to the 'use server' module actions.

async function updateEmployeeTaskStatus(taskId: string, newStatus: string) {
  'use server';
  await employeeUpdateTaskStatusAction(taskId, newStatus);
}

async function toggleChecklistItem(taskId: string, itemId: string, isDone: boolean) {
  'use server';
  await employeeToggleChecklistItemAction(taskId, itemId, isDone);
}

// ─── Add Comment Form ────────────────────────────────────────────────────────

function AddCommentForm({ addComment }: { addComment: (formData: FormData) => Promise<void> }) {
  return (
    <form action={addComment} className="space-y-2">
      <textarea
        name="body"
        rows={3}
        placeholder="Add a comment…"
        required
        className="w-full rounded-xl border border-[var(--pf-border)] bg-[var(--pf-surface)] px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[var(--pf-primary)] focus:border-transparent placeholder:text-[var(--pf-text-muted)]"
      />
      <button
        type="submit"
        className="w-full rounded-xl bg-[var(--pf-primary)] px-4 py-3 text-sm font-medium text-white hover:bg-[var(--pf-primary-hover)] active:bg-[var(--pf-primary-active)] transition-colors min-h-[48px]"
      >
        Post Comment
      </button>
    </form>
  );
}
