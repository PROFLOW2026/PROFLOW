'use client';

/**
 * TaskCreateForm — Full task creation form.
 *
 * Used as:
 *  - Quick-create from board (title only → full form opens in Sheet)
 *  - Standalone form for /work/new or modal
 *
 * Agent A dependency:
 *   createTask — stub from _task-api-stub.ts
 *   TODO: swap to `import { createTask } from '@/modules/tasks'` when Agent A delivers.
 *
 * The form fires a Server Action via `onSubmit` prop (provided by the parent page's actions.ts).
 * This keeps the form usable in both Server-Action and client-side patterns.
 */

import { CalendarIcon, Flag, Tag, User } from 'lucide-react';
import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { cn } from '@/shared/ui/cn';
import type { TaskPriority, TaskStatus } from './_task-api-stub';
import { TaskRecurrenceSection } from './task-recurrence-section';
import type { RecurrencePreset } from '../domain/recurrence-presets';
import { TaskAssigneePicker, type TaskAssigneePickerOption } from './task-assignee-picker';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TaskCreateInput {
  title: string;
  description: string;
  bucketId: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  assigneeKeys: string[];
  assignAllProjectTeam: boolean;
  dueDate: string | null;
  labelIds: string[];
  projectId: string | null;
  workspaceId: string | null;
  recurrencePreset: RecurrencePreset;
  recurrenceInterval: number;
}

interface BucketOption {
  id: string;
  name: string;
}

export interface TaskCreateFormProps {
  /** Available buckets to select from (board-context specific) */
  buckets?: BucketOption[];
  /** Project participant assignee options */
  assignees?: TaskAssigneePickerOption[];
  /** Available labels */
  labels?: string[];
  /** Pre-selected bucket (e.g. from quick-add click) */
  defaultBucketId?: string | null;
  /** Pre-set project context (board is inside a project) */
  defaultProjectId?: string | null;
  /** Pre-set workspace context */
  defaultWorkspaceId?: string | null;
  /** Called on form submit with the collected data */
  onSubmit: (data: TaskCreateInput) => Promise<void> | void;
  /** Called when user dismisses the form */
  onCancel?: () => void;
  className?: string;
}

const STATUS_VALUES: TaskStatus[] = [
  'todo',
  'in_progress',
  'in_review',
  'blocked',
  'done',
  'cancelled',
];

const PRIORITY_VALUES: TaskPriority[] = ['urgent', 'high', 'medium', 'low'];

const _PRIORITY_TONE: Record<TaskPriority, 'neutral' | 'info' | 'warning' | 'danger'> = {
  none: 'neutral',
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function FormLabel({
  htmlFor,
  children,
  required,
}: {
  htmlFor: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className="text-xs font-semibold uppercase tracking-wide text-[var(--pf-text-muted)]"
    >
      {children}
      {required && <span className="ms-0.5 text-[var(--pf-status-danger-fg)]" aria-hidden>*</span>}
    </label>
  );
}

function FormField({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('flex flex-col gap-1.5', className)}>{children}</div>;
}

const inputCls =
  'block w-full rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2.5 py-2 text-sm placeholder:text-[var(--pf-text-muted)] focus:outline-none focus:ring-2 focus:ring-[var(--pf-focus-ring)]';

// ---------------------------------------------------------------------------
// TaskCreateForm
// ---------------------------------------------------------------------------

export function TaskCreateForm({
  buckets = [],
  assignees = [],
  labels = [],
  defaultBucketId = null,
  defaultProjectId = null,
  defaultWorkspaceId = null,
  onSubmit,
  onCancel,
  className,
}: TaskCreateFormProps) {
  const t = useTranslations('tasks');
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const statusOptions = useMemo(
    () => STATUS_VALUES.map((value) => ({ value, label: t(`status.${value}`) })),
    [t],
  );
  const priorityOptions = useMemo(
    () => PRIORITY_VALUES.map((value) => ({ value, label: t(`priority.${value}`) })),
    [t],
  );

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [bucketId, setBucketId] = useState<string | null>(defaultBucketId);
  const [status, setStatus] = useState<TaskStatus>('todo');
  const [priority, setPriority] = useState<TaskPriority>('medium');
  const [assigneeKeys, setAssigneeKeys] = useState<string[]>([]);
  const [assignAllProjectTeam, setAssignAllProjectTeam] = useState(false);
  const [dueDate, setDueDate] = useState<string>('');
  const [selectedLabels, setSelectedLabels] = useState<string[]>([]);
  const [recurrencePreset, setRecurrencePreset] = useState<RecurrencePreset>('none');
  const [recurrenceInterval, setRecurrenceInterval] = useState(1);

  const toggleLabel = (label: string) => {
    setSelectedLabels((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label],
    );
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setError(t('create.titleRequired'));
      return;
    }
    setError(null);

    startTransition(async () => {
      try {
        await onSubmit({
          title: trimmedTitle,
          description: description.trim(),
          bucketId,
          status,
          priority,
          assigneeKeys,
          assignAllProjectTeam,
          dueDate: dueDate || null,
          labelIds: selectedLabels,
          projectId: defaultProjectId,
          workspaceId: defaultWorkspaceId,
          recurrencePreset,
          recurrenceInterval,
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : t('create.error'));
      }
    });
  };

  return (
    <form
      onSubmit={handleSubmit}
      className={cn('flex flex-col gap-4', className)}
      noValidate
    >
      {/* Title */}
      <FormField>
        <FormLabel htmlFor="task-title" required>
          {t('create.titleLabel')}
        </FormLabel>
        <input
          id="task-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t('create.titlePlaceholder')}
          className={cn(inputCls, error && !title.trim() && 'border-[var(--pf-status-danger-border)]')}
          aria-invalid={!!error && !title.trim()}
          aria-describedby={error ? 'task-title-error' : undefined}
        />
        {error && (
          <p id="task-title-error" className="text-xs text-[var(--pf-status-danger-fg)]">
            {error}
          </p>
        )}
      </FormField>

      {/* Description */}
      <FormField>
        <FormLabel htmlFor="task-description">
          {t('create.descriptionLabel')}
        </FormLabel>
        <textarea
          id="task-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t('create.descriptionPlaceholder')}
          rows={3}
          className={cn(inputCls, 'resize-y')}
        />
      </FormField>

      {/* Row: Bucket + Status + Priority */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Bucket */}
        {buckets.length > 0 && (
          <FormField>
            <FormLabel htmlFor="task-bucket">
              {t('create.bucketLabel')}
            </FormLabel>
            <select
              id="task-bucket"
              value={bucketId ?? ''}
              onChange={(e) => setBucketId(e.target.value || null)}
              className={inputCls}
            >
              <option value="">{t('create.noBucket')}</option>
              {buckets.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
          </FormField>
        )}

        {/* Status */}
        <FormField>
          <FormLabel htmlFor="task-status">
            {t('create.statusLabel')}
          </FormLabel>
          <select
            id="task-status"
            value={status}
            onChange={(e) => setStatus(e.target.value as TaskStatus)}
            className={inputCls}
          >
            {statusOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>

        {/* Priority */}
        <FormField>
          <FormLabel htmlFor="task-priority">
            <Flag aria-hidden className="me-1 inline size-3.5" />
            {t('create.priorityLabel')}
          </FormLabel>
          <select
            id="task-priority"
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className={inputCls}
          >
            {priorityOptions.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </FormField>
      </div>

      {/* Due date */}
      <FormField>
        <FormLabel htmlFor="task-due-date">
          <CalendarIcon aria-hidden className="me-1 inline size-3.5" />
          {t('create.dueDateLabel')}
        </FormLabel>
        <input
          id="task-due-date"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          className={inputCls}
        />
      </FormField>

      <TaskRecurrenceSection
        preset={recurrencePreset}
        interval={recurrenceInterval}
        onChange={({ preset, interval }) => {
          setRecurrencePreset(preset);
          setRecurrenceInterval(interval);
        }}
        disabled={isPending}
      />

      {/* Assignees */}
      {assignees.length > 0 && (
        <FormField>
          <FormLabel htmlFor="task-assignees">
            <User aria-hidden className="me-1 inline size-3.5" />
            {t('create.assigneesLabel')}
          </FormLabel>
          <TaskAssigneePicker
            id="task-assignees"
            options={assignees}
            selectedKeys={assigneeKeys}
            onChange={setAssigneeKeys}
            disabled={isPending}
            allowWholeTeam={Boolean(defaultProjectId)}
            wholeTeamSelected={assignAllProjectTeam}
            onWholeTeamChange={setAssignAllProjectTeam}
          />
        </FormField>
      )}

      {/* Labels */}
      {labels.length > 0 && (
        <FormField>
          <FormLabel htmlFor="task-labels">
            <Tag aria-hidden className="me-1 inline size-3.5" />
            {t('create.labelsLabel')}
          </FormLabel>
          <div className="flex flex-wrap gap-1.5" id="task-labels" role="group">
            {labels.map((label) => {
              const selected = selectedLabels.includes(label);
              return (
                <button
                  key={label}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => toggleLabel(label)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs font-medium transition-colors',
                    selected
                      ? 'border-[var(--pf-teal-100)] bg-[var(--pf-teal-50)] text-[var(--pf-teal-800)]'
                      : 'border-[var(--pf-border-default)] text-[var(--pf-text-secondary)] hover:border-[var(--pf-border-strong)]',
                  )}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </FormField>
      )}

      {/* Actions */}
      <div className="flex items-center justify-end gap-2 border-t border-[var(--pf-border-default)] pt-3">
        {onCancel && (
          <Button type="button" variant="ghost" size="md" onClick={onCancel} disabled={isPending}>
            {t('cancel')}
          </Button>
        )}
        <Button
          type="submit"
          variant="primary"
          size="md"
          disabled={isPending}
          aria-busy={isPending}
        >
          {isPending ? t('create.saving') : t('create.submit')}
        </Button>
      </div>
    </form>
  );
}
