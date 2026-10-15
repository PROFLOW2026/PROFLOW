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
 *   updateTask, getTaskDetail — stubs from task-api.ts
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
  User,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Link } from '@/shared/i18n/navigation';
import { TaskEvidenceSummary } from '@/modules/evidence/ui/task-evidence-summary';
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
  archiveTaskAction,
  unarchiveTaskAction,
  listTaskAssigneeOptionsAction,
  syncTaskAssigneesAction,
} from '@/app/[locale]/(app)/work/actions';
import { TaskChecklistSection } from './task-checklist-section';
import { TaskLabelsSection } from './task-labels-section';
import { TaskDependenciesSection } from './task-dependencies-section';
import { TaskSubtasksSection } from './task-subtasks-section';
import { TaskDetailActions } from './task-detail-actions';
import type { TaskDetail, TaskPriority, TaskStatus } from './task-api';
import { TaskRecurrenceSection } from './task-recurrence-section';
import {
  TaskRemindersSection,
  type TaskReminderToggle,
} from './task-reminders-section';
import type { RecurrencePreset } from '../domain/recurrence-presets';
import { PostponeMenu } from './postpone-menu';
import { TaskAssigneePicker, type TaskAssigneePickerOption } from './task-assignee-picker';
import { TaskCommentsDrawerPanel } from './task-comments-drawer-panel';

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
  /** Soft-archive (TASKS_DELETE). No restore UI unless backend adds it later. */
  canArchive?: boolean;
  /** Called after successful archive (close sheet, refresh lists). */
  onTaskArchived?: () => void;
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
  startDate: string | null;
  dueDate: string | null;
  estimatedEffortMinutes: number | null;
  contributesToProgress: boolean;
  progressWeight: string;
  approvalRequired: boolean;
};

function parseProgressWeightDraft(
  raw: string,
): { ok: true; value: number | null } | { ok: false } {
  const trimmed = raw.trim();
  if (trimmed === '') return { ok: true, value: null };
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value < 0 || value > 999999.99) return { ok: false };
  return { ok: true, value };
}

function sameProgressWeight(stored: string | null | undefined, draft: string): boolean {
  const parsed = parseProgressWeightDraft(draft);
  if (!parsed.ok) return false;
  if (parsed.value == null) return stored == null || stored === '';
  if (stored == null || stored === '') return false;
  return Number(stored) === parsed.value;
}

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
  assigneeOptions: assigneeOptionsProp = [],
  canAssign = false,
  onAssigneesChange: onAssigneesChangeProp,
  canArchive = false,
  onTaskArchived,
}: TaskDetailSheetProps) {
  const t = useTranslations('tasks');
  const [isPending, startTransition] = useTransition();
  const taskId = task?.id ?? null;
  const taskIsArchived = task?.isArchived === true;
  const [loadedAssigneeOptions, setLoadedAssigneeOptions] = useState<
    readonly TaskAssigneePickerOption[]
  >([]);

  useEffect(() => {
    if (!open || !taskId || !canAssign || assigneeOptionsProp.length > 0) {
      return;
    }
    let cancelled = false;
    void (async () => {
      const rows = await listTaskAssigneeOptionsAction(taskId);
      if (!cancelled) setLoadedAssigneeOptions(rows);
    })();
    return () => {
      cancelled = true;
    };
  }, [open, taskId, canAssign, assigneeOptionsProp.length]);

  const assigneeOptions =
    assigneeOptionsProp.length > 0 ? assigneeOptionsProp : loadedAssigneeOptions;

  const onAssigneesChange =
    onAssigneesChangeProp ??
    (canAssign
      ? async (input: { assigneeKeys: string[]; assignAllProjectTeam: boolean }) => {
          if (!taskId) return;
          await syncTaskAssigneesAction(taskId, input);
        }
      : undefined);

  const baselineDraft = useMemo((): TaskEditDraft | null => {
    if (!task) return null;
    return {
      title: task.title,
      description: task.description ?? '',
      status: task.status,
      priority: task.priority,
      startDate: task.startDate,
      dueDate: task.dueDate,
      estimatedEffortMinutes: task.estimatedEffortMinutes ?? null,
      contributesToProgress: task.contributesToProgress === true,
      progressWeight: task.progressWeight ?? '',
      approvalRequired: task.approvalRequired === true,
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
      draft.startDate !== task.startDate ||
      draft.dueDate !== task.dueDate ||
      draft.estimatedEffortMinutes !== (task.estimatedEffortMinutes ?? null) ||
      draft.contributesToProgress !== (task.contributesToProgress === true) ||
      !sameProgressWeight(task.progressWeight, draft.progressWeight) ||
      draft.approvalRequired !== (task.approvalRequired === true)
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
            if (draft.startDate !== task.startDate) patch.startDate = draft.startDate;
            if (draft.dueDate !== task.dueDate) patch.dueDate = draft.dueDate;
            if (draft.estimatedEffortMinutes !== (task.estimatedEffortMinutes ?? null)) {
              patch.estimatedEffortMinutes = draft.estimatedEffortMinutes;
            }
            if (draft.contributesToProgress !== (task.contributesToProgress === true)) {
              patch.contributesToProgress = draft.contributesToProgress;
            }
            if (!sameProgressWeight(task.progressWeight, draft.progressWeight)) {
              const weight = parseProgressWeightDraft(draft.progressWeight);
              if (!weight.ok) {
                setSaveMessage({ taskId, type: 'error', text: t('progressWeightInvalid') });
                return;
              }
              patch.progressWeight = weight.value;
            }
            if (draft.approvalRequired !== (task.approvalRequired === true)) {
              patch.approvalRequired = draft.approvalRequired;
            }

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
              {task.clientName ? <Badge tone="neutral">{task.clientName}</Badge> : null}
              {!task.projectId ? <Badge tone="neutral">{t('noProject')}</Badge> : null}
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
              {task.clientName ? <Badge tone="neutral">{task.clientName}</Badge> : null}
              {!task.projectId ? <Badge tone="neutral">{t('noProject')}</Badge> : null}
            </div>
          </div>
        )}

        <SheetBody className={cn('flex flex-col gap-5', embedded && 'px-4 py-4')}>
              {taskIsArchived ? (
                <p
                  role="status"
                  className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-subtle)] px-3 py-2 text-sm text-[var(--pf-text-secondary)]"
                >
                  {t('archivedTaskNotice')}
                </p>
              ) : null}

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

              <Field label={t('approvalRequired')} icon={<BadgeCheck className="size-4" />}>
                <label className="flex cursor-pointer items-start gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft?.approvalRequired ?? task.approvalRequired === true}
                    onChange={(event) =>
                      setDraft((current) =>
                        current ? { ...current, approvalRequired: event.target.checked } : current,
                      )
                    }
                    className="mt-0.5 size-4 rounded border-[var(--pf-border-default)]"
                  />
                  <span className="text-[var(--pf-text-secondary)]">{t('create.approvalRequiredHint')}</span>
                </label>
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
                    disabled={isPending || taskIsArchived}
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

              <Field label={t('task.startDate')} icon={<Calendar className="size-4" />}>
                <input
                  type="date"
                  value={draft?.startDate ?? task.startDate ?? ''}
                  onChange={(event) =>
                    setDraft((current) =>
                      current
                        ? { ...current, startDate: event.target.value || null }
                        : current,
                    )
                  }
                  className="rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
                />
              </Field>

              <Field label={t('task.estimatedEffort')} icon={<Calendar className="size-4" />}>
                <input
                  type="number"
                  min={0}
                  step={0.5}
                  value={
                    draft?.estimatedEffortMinutes != null
                      ? draft.estimatedEffortMinutes / 60
                      : task.estimatedEffortMinutes != null
                        ? task.estimatedEffortMinutes / 60
                        : ''
                  }
                  onChange={(event) => {
                    const raw = event.target.value.trim();
                    const minutes = raw === '' ? null : Math.round(Number(raw) * 60);
                    setDraft((current) =>
                      current ? { ...current, estimatedEffortMinutes: minutes } : current,
                    );
                  }}
                  className="w-28 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
                />
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

              {task.projectId ? (
                <div className="flex flex-col gap-2">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={draft?.contributesToProgress ?? false}
                      onChange={(event) =>
                        setDraft((current) =>
                          current
                            ? { ...current, contributesToProgress: event.target.checked }
                            : current,
                        )
                      }
                      className="size-4 cursor-pointer rounded border-[var(--pf-border-default)] accent-[var(--pf-action-primary)]"
                    />
                    <span>{t('countsTowardProjectProgress')}</span>
                  </label>
                  {draft?.contributesToProgress ? (
                    <label className="flex flex-col gap-1 text-sm">
                      <span className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]">
                        {t('progressWeightLabel')}
                      </span>
                      <input
                        type="text"
                        inputMode="decimal"
                        value={draft.progressWeight}
                        onChange={(event) =>
                          setDraft((current) =>
                            current ? { ...current, progressWeight: event.target.value } : current,
                          )
                        }
                        placeholder="1"
                        className="w-32 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]"
                      />
                      <span className="text-xs text-[var(--pf-text-muted)]">{t('progressWeightHint')}</span>
                    </label>
                  ) : null}
                </div>
              ) : null}

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

              <TaskLabelsSection
                taskId={task.id}
                assignments={task.labelAssignments ?? []}
                disabled={isPending || taskIsArchived}
                onRefresh={handleRefresh}
              />

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
                canArchive={canArchive}
                taskIsArchived={taskIsArchived}
                onArchive={() => archiveTaskAction(task.id)}
                onArchived={() => {
                  onOpenChange(false);
                  onTaskArchived?.();
                }}
                onUnarchive={() => unarchiveTaskAction(task.id)}
                onUnarchived={async () => {
                  await handleRefresh();
                  onTaskArchived?.();
                }}
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

              <TaskChecklistSection
                taskId={task.id}
                items={task.checklist}
                disabled={isPending || taskIsArchived}
                onRefresh={handleRefresh}
              />

              <TaskEvidenceSummary taskId={task.id} />

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

              {!embedded ? <TaskCommentsDrawerPanel taskId={task.id} /> : null}

              {!embedded ? (
                <p className="text-sm">
                  <Link
                    href={`/tasks/${task.id}`}
                    className="inline-flex items-center gap-1 font-medium text-[var(--pf-text-brand)] underline underline-offset-2"
                  >
                    {t('openFullTask')}
                  </Link>
                </p>
              ) : null}

              <div className="sticky bottom-0 -mx-4 border-t border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    className={uwmPrimaryButtonClass}
                    disabled={taskIsArchived || (!isDirty && !assigneesDirty) || isPending}
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
