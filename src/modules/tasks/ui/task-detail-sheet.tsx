'use client';

/**
 * TaskDetailSheet — Side drawer with full task detail.
 *
 * UI decision: end-side Sheet (Radix Dialog) on all screen sizes.
 * On mobile it goes full-width; on desktop it's capped at max-w-xl.
 *
 * Sections: title/description (inline editable), status selector,
 * priority selector, assignees, due date, checklist, labels, attachments,
 * comments (Agent E slot), activity feed (Agent E slot), breadcrumb.
 *
 * Agent A dependency:
 *   updateTask, getTaskDetail — stubs from _task-api-stub.ts
 *   TODO: swap to `import { updateTask } from '@/modules/tasks'` when Agent A delivers.
 *
 * Agent E dependency:
 *   CommentsPanel, ActivityFeed — placeholder slots; wire in when Agent E delivers.
 */

import {
  AlertCircle,
  BadgeCheck,
  Calendar,
  ChevronRight,
  CheckSquare,
  FileText,
  Flag,
  Loader2,
  Paperclip,
  Tag,
  User,
  X,
} from 'lucide-react';
import { useCallback, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from '@/components/ui/sheet';
import { cn } from '@/shared/ui/cn';
import type { TaskDetail, TaskPriority, TaskStatus } from './_task-api-stub';

// ---------------------------------------------------------------------------
// Helpers / sub-components
// ---------------------------------------------------------------------------

const STATUS_VALUES: TaskStatus[] = [
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
];

const PRIORITY_VALUES: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

const STATUS_TONE: Record<
  TaskStatus,
  'neutral' | 'info' | 'pending' | 'warning' | 'danger' | 'success'
> = {
  todo: 'neutral',
  in_progress: 'info',
  in_review: 'pending',
  blocked: 'danger',
  done: 'success',
  cancelled: 'neutral',
};

const PRIORITY_TONE: Record<TaskPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  none: 'neutral',
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
      {children}
    </p>
  );
}

function Field({
  label,
  icon,
  children,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <span className="mt-0.5 shrink-0 text-[var(--pf-text-muted)]" aria-hidden>
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <SectionLabel>{label}</SectionLabel>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  );
}

/** Inline editable title */
function EditableTitle({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  if (editing) {
    return (
      <textarea
         
        autoFocus
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => {
          setEditing(false);
          if (draft.trim() && draft.trim() !== value) onChange(draft.trim());
        }}
        onKeyDown={(e) => {
          if (e.key === 'Escape') {
            setDraft(value);
            setEditing(false);
          }
        }}
        rows={2}
        className="w-full resize-none rounded-md border border-[var(--pf-border-strong)] bg-[var(--pf-bg-surface)] px-2 py-1 text-lg font-semibold focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => setEditing(true)}
      className="w-full cursor-text text-start text-lg font-semibold hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
    >
      {value}
    </button>
  );
}

/** Checklist items */
function ChecklistSection({
  items,
  onToggle,
}: {
  items: TaskDetail['checklist'];
  onToggle: (id: string, done: boolean) => void;
}) {
  const t = useTranslations('tasks');
  const done = items.filter((i) => i.done).length;

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <SectionLabel>{t('checklist')}</SectionLabel>
        <span className="text-xs text-[var(--pf-text-muted)]">
          {done}/{items.length}
        </span>
      </div>
      {/* Progress bar */}
      <div
        role="progressbar"
        aria-valuenow={done}
        aria-valuemin={0}
        aria-valuemax={items.length}
        className="h-1.5 w-full overflow-hidden rounded-full bg-[var(--pf-bg-muted)]"
      >
        <div
          className="h-full rounded-full bg-[var(--pf-action-primary)] transition-[width]"
          style={{ width: `${items.length > 0 ? (done / items.length) * 100 : 0}%` }}
        />
      </div>
      <ul className="flex flex-col gap-1.5">
        {items.map((item) => (
          <li key={item.id} className="flex items-center gap-2">
            <input
              type="checkbox"
              id={`checklist-${item.id}`}
              checked={item.done}
              onChange={(e) => onToggle(item.id, e.target.checked)}
              className="size-4 cursor-pointer rounded border-[var(--pf-border-default)] accent-[var(--pf-action-primary)]"
            />
            <label
              htmlFor={`checklist-${item.id}`}
              className={cn(
                'cursor-pointer text-sm',
                item.done && 'line-through text-[var(--pf-text-muted)]',
              )}
            >
              {item.title}
            </label>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export interface TaskDetailSheetProps {
  task: TaskDetail | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Called when user changes a field.
   * Parent must fire the updateTask Server Action.
   * TODO: accept actual server action from Agent A.
   */
  onUpdate: (taskId: string, data: Record<string, unknown>) => void;
}

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  onUpdate,
}: TaskDetailSheetProps) {
  const t = useTranslations('tasks');
  const [isPending, startTransition] = useTransition();

  const statusOptions = useMemo(
    () => STATUS_VALUES.map((value) => ({ value, label: t(`status.${value}`) })),
    [t],
  );
  const priorityOptions = useMemo(
    () => PRIORITY_VALUES.map((value) => ({ value, label: t(`priority.${value}`) })),
    [t],
  );

  const handleUpdate = useCallback(
    (data: Record<string, unknown>) => {
      if (!task) return;
      startTransition(() => {
        onUpdate(task.id, data);
      });
    },
    [task, onUpdate, startTransition],
  );

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="end"
        className="w-full sm:max-w-xl"
        closeLabel={t('close')}
      >
        {isPending && (
          <div className="absolute inset-x-0 top-0 flex justify-center py-1">
            <Loader2 aria-label={t('saving')} className="size-4 animate-spin text-[var(--pf-text-muted)]" />
          </div>
        )}

        {task == null ? (
          <div className="flex flex-1 items-center justify-center">
            <Loader2 className="size-6 animate-spin text-[var(--pf-text-muted)]" />
          </div>
        ) : (
          <>
            <SheetHeader>
              {/* Breadcrumb */}
              <nav aria-label={t('breadcrumb')} className="flex flex-wrap items-center gap-0.5 text-xs text-[var(--pf-text-muted)]">
                {task.workspaceName && (
                  <>
                    <span>{task.workspaceName}</span>
                    <ChevronRight aria-hidden className="size-3 rtl:rotate-180" />
                  </>
                )}
                {task.boardName && (
                  <>
                    <span>{task.boardName}</span>
                    <ChevronRight aria-hidden className="size-3 rtl:rotate-180" />
                  </>
                )}
                {task.bucketName && (
                  <>
                    <span>{task.bucketName}</span>
                    <ChevronRight aria-hidden className="size-3 rtl:rotate-180" />
                  </>
                )}
                <span className="font-medium text-[var(--pf-text-primary)]">{t('task')}</span>
              </nav>

              {/* Title */}
              <SheetTitle asChild>
                <EditableTitle
                  value={task.title}
                  onChange={(title) => handleUpdate({ title })}
                />
              </SheetTitle>

              {/* Badges row */}
              <div className="flex flex-wrap items-center gap-2">
                {task.projectName && (
                  <Badge tone="brand">
                    <FileText aria-hidden className="size-3" />
                    {task.projectName}
                  </Badge>
                )}
                {task.approvalRequired && (
                  <Badge tone="pending">
                    <BadgeCheck aria-hidden className="size-3" />
                    {t('approvalRequired')}
                  </Badge>
                )}
                {task.isBlocked && (
                  <Badge tone="danger">
                    <AlertCircle aria-hidden className="size-3" />
                    {t('status.blocked')}
                  </Badge>
                )}
              </div>
            </SheetHeader>

            <SheetBody className="flex flex-col gap-5">
              {/* Status */}
              <Field label={t('statusLabel')} icon={<CheckSquare className="size-4" />}>
                <select
                  value={task.status}
                  onChange={(e) => handleUpdate({ status: e.target.value })}
                  className="block w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div className="mt-1">
                  <Badge tone={STATUS_TONE[task.status]} className="text-xs">
                    {statusOptions.find((o) => o.value === task.status)?.label}
                  </Badge>
                </div>
              </Field>

              {/* Priority */}
              <Field label={t('priorityLabel')} icon={<Flag className="size-4" />}>
                <div className="flex flex-wrap gap-1.5">
                  {priorityOptions.map((o) => (
                    <button
                      key={o.value}
                      type="button"
                      onClick={() => handleUpdate({ priority: o.value })}
                      aria-pressed={task.priority === o.value}
                      className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
                    >
                      <Badge
                        tone={
                          task.priority === o.value ? PRIORITY_TONE[o.value] : 'neutral'
                        }
                        className={cn(
                          'cursor-pointer text-xs transition-opacity',
                          task.priority !== o.value && 'opacity-50 hover:opacity-80',
                        )}
                      >
                        {o.label}
                      </Badge>
                    </button>
                  ))}
                </div>
              </Field>

              {/* Assignees */}
              <Field label={t('assigneesLabel')} icon={<User className="size-4" />}>
                {task.assignees.length === 0 ? (
                  <p className="text-sm text-[var(--pf-text-muted)]">{t('unassigned')}</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {task.assignees.map((a) => (
                      <div key={a.id} className="flex items-center gap-1.5">
                        {a.avatarUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={a.avatarUrl}
                            alt={a.displayName ?? ''}
                            className="size-6 rounded-full object-cover"
                          />
                        ) : (
                          <span className="flex size-6 items-center justify-center rounded-full bg-[var(--pf-teal-100)] text-[0.625rem] font-semibold uppercase text-[var(--pf-teal-800)]">
                            {(a.displayName ?? '?')[0]}
                          </span>
                        )}
                        <span className="text-sm">{a.displayName}</span>
                      </div>
                    ))}
                  </div>
                )}
              </Field>

              {/* Due date */}
              <Field label={t('dueDateLabel')} icon={<Calendar className="size-4" />}>
                <input
                  type="date"
                  defaultValue={task.dueDate ?? ''}
                  onBlur={(e) => {
                    const val = e.target.value || null;
                    if (val !== task.dueDate) handleUpdate({ dueDate: val });
                  }}
                  className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
                />
              </Field>

              {/* Labels */}
              {task.labels.length > 0 && (
                <Field label={t('labelsLabel')} icon={<Tag className="size-4" />}>
                  <div className="flex flex-wrap gap-1">
                    {task.labels.map((label) => (
                      <Badge key={label} tone="brand" className="text-xs">
                        {label}
                        <button
                          type="button"
                          onClick={() =>
                            handleUpdate({ labels: task.labels.filter((l) => l !== label) })
                          }
                          aria-label={t('removeLabel', { label })}
                          className="ms-0.5"
                        >
                          <X className="size-2.5" aria-hidden />
                        </button>
                      </Badge>
                    ))}
                  </div>
                </Field>
              )}

              {/* Description */}
              <div>
                <SectionLabel>{t('descriptionLabel')}</SectionLabel>
                <textarea
                  defaultValue={task.description ?? ''}
                  placeholder={t('descriptionPlaceholder')}
                  rows={4}
                  onBlur={(e) => {
                    const val = e.target.value.trim() || null;
                    if (val !== task.description) handleUpdate({ description: val });
                  }}
                  className="mt-1 w-full resize-y rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-2 text-sm placeholder:text-[var(--pf-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
                />
              </div>

              {/* Checklist */}
              {task.checklist.length > 0 && (
                <ChecklistSection
                  items={task.checklist}
                  onToggle={(id, done) => {
                    // Parent handles optimistic checklist update
                    handleUpdate({
                      checklist: task.checklist.map((i) =>
                        i.id === id ? { ...i, done } : i,
                      ),
                    });
                  }}
                />
              )}

              {/* Attachments */}
              {task.attachments.length > 0 && (
                <div>
                  <SectionLabel>{t('attachmentsLabel')}</SectionLabel>
                  <ul className="mt-1.5 flex flex-col gap-1.5">
                    {task.attachments.map((att) => (
                      <li key={att.id}>
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm hover:bg-[var(--pf-bg-muted)]"
                        >
                          <Paperclip aria-hidden className="size-4 shrink-0 text-[var(--pf-text-muted)]" />
                          <span className="min-w-0 truncate">{att.name}</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Agent E: Comments slot */}
              <div>
                <SectionLabel>{t('commentsLabel')}</SectionLabel>
                {/* TODO: Replace with <CommentsPanel taskId={task.id} /> from Agent E */}
                <div className="mt-2 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4 text-center text-xs text-[var(--pf-text-muted)]">
                  {t('commentsSlot')}
                </div>
              </div>

              {/* Agent E: Activity feed slot */}
              <div>
                <SectionLabel>{t('activityLabel')}</SectionLabel>
                {/* TODO: Replace with <ActivityFeed taskId={task.id} /> from Agent E */}
                <div className="mt-2 rounded-lg border border-dashed border-[var(--pf-border-default)] p-4 text-center text-xs text-[var(--pf-text-muted)]">
                  {t('activitySlot')}
                </div>
              </div>
            </SheetBody>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
