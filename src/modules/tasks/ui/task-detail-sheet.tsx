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
  Clock,
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
import { Link } from '@/shared/i18n/navigation';
import { Badge } from '@/components/ui/badge';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetBody,
} from '@/components/ui/sheet';
import { cn } from '@/shared/ui/cn';
import {
  uwmPrimaryButtonClass,
} from '@/shared/ui/uwm-surface-styles';
import {
  addDependencyAction,
  createSubtaskAction,
  createTaskFromTemplateAction,
  duplicateTaskAction,
  listTaskPickerOptionsAction,
  listTaskTemplatesAction,
  removeDependencyAction,
  saveTaskAsTemplateAction,
} from '@/app/[locale]/(app)/work/actions';
import { TaskDependenciesSection } from './task-dependencies-section';
import { TaskSubtasksSection } from './task-subtasks-section';
import { TaskDetailActions } from './task-detail-actions';
import type { TaskDetail, TaskPriority, TaskStatus } from './_task-api-stub';
import { TaskRecurrenceSection } from './task-recurrence-section';
import {
  TaskRemindersSection,
  type TaskReminderToggle,
} from './task-reminders-section';
import type { RecurrencePreset } from '../domain/recurrence-presets';
import { PostponeMenu } from './postpone-menu';
import { TaskAssigneePicker, type TaskAssigneePickerOption } from './task-assignee-picker';

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
  /** When true, renders inline panel content without the Sheet overlay (full page mode). */
  embedded?: boolean;
  /**
   * Called when user saves pending field changes.
   * Parent must fire the updateTask Server Action.
   */
  onUpdate: (
    taskId: string,
    data: Record<string, unknown>,
  ) => void | Promise<{ success?: boolean; error?: string } | void>;
  /** Reload task detail after dependency/subtask/duplicate/template mutations. */
  onRefresh?: (taskId: string) => void | Promise<void>;
  /** Business today (YYYY-MM-DD) for postpone menu baseline. */
  today?: string;
  /** When true, show postpone actions (+1 day / +1 week / pick date). */
  canPostpone?: boolean;
  /** Base path for canonical time entry flow (projectId + taskId query params appended). */
  timeLogBasePath?: string;
  recurrencePreset?: RecurrencePreset;
  recurrenceInterval?: number;
  onRecurrenceChange?: (value: { preset: RecurrencePreset; interval: number }) => void | Promise<void>;
  reminders?: TaskReminderToggle[];
  onReminderChange?: (value: TaskReminderToggle) => void | Promise<void>;
  assigneeOptions?: readonly TaskAssigneePickerOption[];
  canAssign?: boolean;
  onAssigneesChange?: (input: {
    assigneeKeys: string[];
    assignAllProjectTeam: boolean;
  }) => void | Promise<void>;
}

function resolveAssigneeKeysFromTask(
  assignees: TaskDetail['assignees'],
  options: readonly TaskAssigneePickerOption[],
): string[] {
  const keys: string[] = [];
  for (const assignee of assignees) {
    const match = options.find(
      (option) => option.key === `e:${assignee.id}` || option.key === `m:${assignee.id}`,
    );
    if (match) keys.push(match.key);
  }
  return keys;
}

type TaskEditDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
};

export function TaskDetailSheet({
  task,
  open,
  onOpenChange,
  embedded = false,
  onUpdate,
  onRefresh,
  today,
  canPostpone = false,
  timeLogBasePath,
  recurrencePreset = 'none',
  recurrenceInterval = 1,
  onRecurrenceChange,
  reminders = [],
  onReminderChange,
  assigneeOptions = [],
  canAssign = false,
  onAssigneesChange,
}: TaskDetailSheetProps) {
  const t = useTranslations('tasks');
  const [isPending, startTransition] = useTransition();
  const taskId = task?.id ?? null;

  const baselineDraft = useMemo((): TaskEditDraft | null => {
    if (!task) return null;
    return {
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      dueDate: task.dueDate,
    };
  }, [task]);

  const [draftOverride, setDraftOverride] = useState<{
    taskId: string;
    draft: TaskEditDraft;
  } | null>(null);

  const draft =
    draftOverride != null && draftOverride.taskId === taskId
      ? draftOverride.draft
      : baselineDraft;

  const setDraft = useCallback(
    (update: React.SetStateAction<TaskEditDraft | null>) => {
      setDraftOverride((prev) => {
        const current =
          prev != null && prev.taskId === taskId ? prev.draft : baselineDraft;
        const nextDraft =
          typeof update === 'function'
            ? (update as (value: TaskEditDraft | null) => TaskEditDraft | null)(current)
            : update;
        if (nextDraft == null || taskId == null) return null;
        return { taskId, draft: nextDraft };
      });
    },
    [baselineDraft, taskId],
  );

  const [saveMessage, setSaveMessage] = useState<{
    taskId: string | null;
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const baselineAssigneeKeys = useMemo(() => {
    if (!task) return [] as string[];
    return assigneeOptions.length > 0
      ? resolveAssigneeKeysFromTask(task.assignees, assigneeOptions)
      : [];
  }, [task, assigneeOptions]);

  const [assigneeOverride, setAssigneeOverride] = useState<{
    taskId: string;
    keys: string[];
    assignAllProjectTeam: boolean;
  } | null>(null);

  const assigneeKeys =
    assigneeOverride != null && assigneeOverride.taskId === taskId
      ? assigneeOverride.keys
      : baselineAssigneeKeys;
  const assignAllProjectTeam =
    assigneeOverride != null && assigneeOverride.taskId === taskId
      ? assigneeOverride.assignAllProjectTeam
      : false;

  const setAssigneeKeys = useCallback(
    (keys: string[]) => {
      if (taskId == null) return;
      setAssigneeOverride((prev) => ({
        taskId,
        keys,
        assignAllProjectTeam:
          prev != null && prev.taskId === taskId ? prev.assignAllProjectTeam : false,
      }));
    },
    [taskId],
  );

  const setAssignAllProjectTeam = useCallback(
    (selected: boolean) => {
      if (taskId == null) return;
      setAssigneeOverride((prev) => ({
        taskId,
        keys: selected
          ? []
          : prev != null && prev.taskId === taskId
            ? prev.keys
            : baselineAssigneeKeys,
        assignAllProjectTeam: selected,
      }));
    },
    [baselineAssigneeKeys, taskId],
  );

  const activeSaveMessage =
    saveMessage?.taskId === taskId
      ? { type: saveMessage.type, text: saveMessage.text }
      : null;

  const isDirty = useMemo(() => {
    if (!task || !draft) return false;
    return (
      draft.title.trim() !== task.title ||
      (draft.description.trim() || null) !== task.description ||
      draft.status !== task.status ||
      draft.priority !== task.priority ||
      draft.dueDate !== task.dueDate
    );
  }, [task, draft]);

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
      if (!task) return Promise.resolve(undefined);
      return Promise.resolve(onUpdate(task.id, data));
    },
    [task, onUpdate],
  );

  const handleRefresh = useCallback(async () => {
    if (!task) return;
    await onRefresh?.(task.id);
  }, [onRefresh, task]);

  const assigneesDirty = useMemo(() => {
    if (!task || !canAssign || !onAssigneesChange) return false;
    if (assignAllProjectTeam) return true;
    const baseline = resolveAssigneeKeysFromTask(task.assignees, assigneeOptions);
    if (baseline.length !== assigneeKeys.length) return true;
    return baseline.some((key) => !assigneeKeys.includes(key));
  }, [task, canAssign, onAssigneesChange, assignAllProjectTeam, assigneeKeys, assigneeOptions]);

  const handleSaveChanges = useCallback(() => {
    if (!task || !draft) return;
    if (!isDirty && !assigneesDirty) return;

    startTransition(() => {
      void (async () => {
        setSaveMessage(null);
        try {
          if (isDirty) {
            const patch: Record<string, unknown> = {};
            if (draft.title.trim() !== task.title) patch.title = draft.title.trim();
            if ((draft.description.trim() || null) !== task.description) {
              patch.description = draft.description.trim() || null;
            }
            if (draft.status !== task.status) patch.status = draft.status;
            if (draft.priority !== task.priority) patch.priority = draft.priority;
            if (draft.dueDate !== task.dueDate) patch.dueDate = draft.dueDate;

            const result = await handleUpdate(patch);
            if (result && 'error' in result && result.error) {
              setSaveMessage({ taskId, type: 'error', text: result.error });
              return;
            }
          }

          if (assigneesDirty && onAssigneesChange) {
            await onAssigneesChange({ assigneeKeys, assignAllProjectTeam });
            await handleRefresh();
          }

          setSaveMessage({ taskId, type: 'success', text: t('saveSuccess') });
        } catch {
          setSaveMessage({ taskId, type: 'error', text: t('saveFailed') });
        }
      })();
    });
  }, [
    task,
    draft,
    isDirty,
    assigneesDirty,
    handleUpdate,
    onAssigneesChange,
    assigneeKeys,
    assignAllProjectTeam,
    handleRefresh,
    t,
    taskId,
  ]);

  const body =
    task == null ? (
      <div className="flex flex-1 items-center justify-center p-8">
        <Loader2 className="size-6 animate-spin text-[var(--pf-text-muted)]" />
      </div>
    ) : (
      <>
        {!embedded ? (
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
              <span className="font-medium text-[var(--pf-text-primary)]">{t('taskEntityLabel')}</span>
            </nav>

            <SheetTitle asChild>
              <input
                value={draft?.title ?? task.title}
                onChange={(event) =>
                  setDraft((current) =>
                    current ? { ...current, title: event.target.value } : current,
                  )
                }
                className="w-full rounded-md border border-transparent bg-transparent px-0 text-lg font-semibold focus:border-[var(--pf-border-strong)] focus:bg-[var(--pf-bg-surface)] focus:px-2 focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
              />
            </SheetTitle>

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
        ) : (
          <div className="border-b border-[var(--pf-border-default)] px-4 py-4">
            <input
              value={draft?.title ?? task.title}
              onChange={(event) =>
                setDraft((current) =>
                  current ? { ...current, title: event.target.value } : current,
                )
              }
              className="w-full rounded-md border border-transparent bg-transparent px-0 text-lg font-semibold focus:border-[var(--pf-border-strong)] focus:bg-[var(--pf-bg-surface)] focus:px-2 focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
            />
            <div className="mt-2 flex flex-wrap items-center gap-2">
              {task.projectName && (
                <Badge tone="brand">
                  <FileText aria-hidden className="size-3" />
                  {task.projectName}
                </Badge>
              )}
            </div>
          </div>
        )}

        <SheetBody className={cn('flex flex-col gap-5', embedded && 'px-4 py-4')}>
              {/* Status */}
              <Field label={t('statusLabel')} icon={<CheckSquare className="size-4" />}>
                <select
                  value={draft?.status ?? task.status}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, status: event.target.value as TaskStatus }
                        : current,
                    )
                  }
                  className="block w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
                >
                  {statusOptions.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <div className="mt-1">
                    <Badge tone={STATUS_TONE[draft?.status ?? task.status]} className="text-xs">
                      {statusOptions.find((o) => o.value === (draft?.status ?? task.status))?.label}
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
                      onClick={() =>
                        setDraft((current) =>
                          current ? { ...current, priority: o.value } : current,
                        )
                      }
                      aria-pressed={(draft?.priority ?? task.priority) === o.value}
                      className="focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
                    >
                      <Badge
                        tone={
                          (draft?.priority ?? task.priority) === o.value
                            ? PRIORITY_TONE[o.value]
                            : 'neutral'
                        }
                        className={cn(
                          'cursor-pointer text-xs transition-opacity',
                          (draft?.priority ?? task.priority) !== o.value &&
                            'opacity-50 hover:opacity-80',
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
                {canAssign && onAssigneesChange && assigneeOptions.length > 0 ? (
                  <TaskAssigneePicker
                    options={assigneeOptions}
                    selectedKeys={assigneeKeys}
                    onChange={setAssigneeKeys}
                    disabled={isPending}
                    allowWholeTeam={Boolean(task.projectId)}
                    wholeTeamSelected={assignAllProjectTeam}
                    onWholeTeamChange={setAssignAllProjectTeam}
                  />
                ) : task.assignees.length === 0 ? (
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
                <div className="flex flex-wrap items-center gap-2">
                  <input
                    type="date"
                    value={draft?.dueDate ?? task.dueDate ?? ''}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? { ...current, dueDate: event.target.value || null }
                          : current,
                      )
                    }
                    className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
                  />
                  {canPostpone && today ? (
                    <PostponeMenu
                      dueDate={draft?.dueDate ?? task.dueDate}
                      today={today}
                      compact
                      onApply={async (nextDueDate) => {
                        await handleUpdate({ dueDate: nextDueDate });
                        setDraft((current) =>
                          current ? { ...current, dueDate: nextDueDate } : current,
                        );
                      }}
                    />
                  ) : null}
                </div>
              </Field>

              {onRecurrenceChange ? (
                <TaskRecurrenceSection
                  preset={recurrencePreset}
                  interval={recurrenceInterval}
                  onChange={onRecurrenceChange}
                  disabled={isPending}
                />
              ) : null}

              {onReminderChange ? (
                <TaskRemindersSection
                  reminders={reminders}
                  hasDueDate={Boolean(draft?.dueDate ?? task.dueDate)}
                  onChange={onReminderChange}
                  disabled={isPending}
                />
              ) : null}

              {/* Reported time (read-only attribution) */}
              <Field label={t('reportedTimeLabel')} icon={<Clock className="size-4" />}>
                <p className="text-sm text-[var(--pf-text-primary)]">
                  {t('reportedTimeHours', {
                    hours: Number(task.reportedHours ?? 0).toLocaleString(undefined, {
                      maximumFractionDigits: 2,
                    }),
                  })}
                </p>
                {timeLogBasePath && task.projectId ? (
                  <p className="mt-1.5">
                    <Link
                      href={`${timeLogBasePath}?projectId=${task.projectId}&taskId=${task.id}`}
                      className="text-sm font-medium text-[var(--pf-text-brand)] underline underline-offset-2"
                    >
                      {t('reportTimeForTask')}
                    </Link>
                  </p>
                ) : null}
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

              <TaskDetailActions
                taskId={task.id}
                workspaceId={task.workspaceId}
                projectId={task.projectId}
                boardId={task.boardId}
                bucketId={task.bucketId}
                onDuplicate={duplicateTaskAction}
                onSaveAsTemplate={saveTaskAsTemplateAction}
                onCreateFromTemplate={createTaskFromTemplateAction}
                listTemplates={listTaskTemplatesAction}
              />

              <TaskDependenciesSection
                taskId={task.id}
                dependsOn={task.dependsOn ?? []}
                blockedBy={task.blockedBy ?? []}
                blocks={task.blocks ?? []}
                onRefresh={handleRefresh}
                listPickerOptions={listTaskPickerOptionsAction}
                onAddDependency={addDependencyAction}
                onRemoveDependency={removeDependencyAction}
              />

              <TaskSubtasksSection
                taskId={task.id}
                parentTask={task.parentTask ?? null}
                subtasks={task.subtasks ?? []}
                canAddSubtask={!task.parentTask}
                onRefresh={handleRefresh}
                onCreateSubtask={createSubtaskAction}
              />

              {/* Description */}
              <div>
                <SectionLabel>{t('descriptionLabel')}</SectionLabel>
                <textarea
                  value={draft?.description ?? task.description ?? ''}
                  placeholder={t('descriptionPlaceholder')}
                  rows={4}
                  onChange={(event) =>
                    setDraft((current) =>
                      current ? { ...current, description: event.target.value } : current,
                    )
                  }
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

              {!embedded ? (
                <div className="rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] p-4">
                  <SectionLabel>{t('drawerExtendedDetails')}</SectionLabel>
                  <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">
                    {t('drawerExtendedDetailsHint')}
                  </p>
                  <p className="mt-3">
                    <Link
                      href={`/tasks/${task.id}`}
                      className="inline-flex items-center gap-1 text-sm font-medium text-[var(--pf-text-brand)] underline underline-offset-2"
                    >
                      {t('openFullTask')}
                    </Link>
                  </p>
                </div>
              ) : null}

              <div className="sticky bottom-0 -mx-4 border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={uwmPrimaryButtonClass}
                    disabled={(!isDirty && !assigneesDirty) || isPending}
                    onClick={handleSaveChanges}
                  >
                    {isPending ? t('saving') : t('saveChanges')}
                  </button>
                  {isDirty || assigneesDirty ? (
                    <span className="text-xs font-medium text-[var(--pf-text-secondary)]">
                      {t('pendingChanges')}
                    </span>
                  ) : null}
                </div>
                {activeSaveMessage ? (
                  <p
                    className={cn(
                      'mt-2 text-sm',
                      activeSaveMessage.type === 'success'
                        ? 'text-[var(--pf-status-success-fg)]'
                        : 'text-[var(--pf-status-danger-fg)]',
                    )}
                  >
                    {activeSaveMessage.text}
                  </p>
                ) : null}
              </div>
            </SheetBody>
      </>
    );

  if (embedded) {
    return (
      <div className="relative">
        {isPending ? (
          <div className="absolute inset-x-0 top-0 flex justify-center py-1">
            <Loader2 aria-label={t('saving')} className="size-4 animate-spin text-[var(--pf-text-muted)]" />
          </div>
        ) : null}
        {body}
      </div>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="end"
        className="w-full sm:max-w-xl"
        closeLabel={t('close')}
      >
        {isPending ? (
          <div className="absolute inset-x-0 top-0 flex justify-center py-1">
            <Loader2 aria-label={t('saving')} className="size-4 animate-spin text-[var(--pf-text-muted)]" />
          </div>
        ) : null}
        {body}
      </SheetContent>
    </Sheet>
  );
}
