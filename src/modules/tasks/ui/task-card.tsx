'use client';

/**
 * TaskCard — Kanban board card.
 *
 * Displays task title, assignee avatars, due date, priority badge, status
 * badge, checklist progress, label chips, and a blocked indicator.
 *
 * Both bucket name and canonical status are shown, per architectural rule:
 * "Display BOTH bucket name and status badge on task cards."
 */

import { AlertCircle, BadgeCheck, Calendar, CheckSquare } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { Badge } from '@/components/ui/badge';
import { coerceBusinessDate } from '@/shared/dates/dates';
import { formatBusinessDateMonthDay } from '@/shared/dates/format';
import { cn } from '@/shared/ui/cn';
import type { TaskCardData, TaskPriority, TaskStatus } from './_task-api-stub';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

const PRIORITY_LABEL_KEY: Record<TaskPriority, string> = {
  none: 'none',
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'urgent',
};

const PRIORITY_TONE: Record<
  TaskPriority,
  'neutral' | 'info' | 'warning' | 'danger'
> = {
  none: 'neutral',
  low: 'neutral',
  medium: 'info',
  high: 'warning',
  urgent: 'danger',
};

function isTaskOverdue(dueDate: string, status: TaskStatus): boolean {
  if (status === 'done' || status === 'cancelled') return false;
  const today = new Date().toISOString().slice(0, 10);
  return dueDate < today;
}

/** Abbreviated avatar circle */
function Avatars({ assignees }: { assignees: TaskCardData['assignees'] }) {
  if (assignees.length === 0) return null;
  const visible = assignees.slice(0, 3);
  const overflow = assignees.length - visible.length;

  return (
    <div className="flex -space-x-1.5 rtl:space-x-reverse">
      {visible.map((a) =>
        a.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            key={a.id}
            src={a.avatarUrl}
            alt={a.displayName ?? ''}
            className="size-6 rounded-full border-2 border-[var(--pf-bg-surface)] object-cover"
          />
        ) : (
          <span
            key={a.id}
            className="flex size-6 items-center justify-center rounded-full border-2 border-[var(--pf-bg-surface)] bg-[var(--pf-teal-100)] text-[0.625rem] font-semibold uppercase text-[var(--pf-teal-800)]"
            aria-label={a.displayName ?? undefined}
          >
            {(a.displayName ?? '?')[0]}
          </span>
        ),
      )}
      {overflow > 0 && (
        <span className="flex size-6 items-center justify-center rounded-full border-2 border-[var(--pf-bg-surface)] bg-[var(--pf-bg-muted)] text-[0.625rem] font-semibold text-[var(--pf-text-muted)]">
          +{overflow}
        </span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Task Card
// ---------------------------------------------------------------------------

export interface TaskCardProps {
  task: TaskCardData;
  /** Called when card is clicked — parent opens task detail sheet */
  onOpen?: (taskId: string) => void;
  /** Whether the card is being dragged */
  isDragging?: boolean;
  className?: string;
}

export function TaskCard({ task, onOpen, isDragging, className }: TaskCardProps) {
  const t = useTranslations('tasks');
  const locale = useLocale();

  const dueDateBusiness = task.dueDate ? coerceBusinessDate(task.dueDate) : null;
  const dueDateLabel = dueDateBusiness
    ? formatBusinessDateMonthDay(dueDateBusiness, locale)
    : null;
  const isOverdue =
    dueDateBusiness != null && isTaskOverdue(dueDateBusiness, task.status);

  return (
    <article
      role="button"
      tabIndex={0}
      onClick={() => onOpen?.(task.id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onOpen?.(task.id);
        }
      }}
      aria-label={task.title}
      className={cn(
        'group flex cursor-pointer flex-col gap-2 rounded-lg border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] p-3 text-start',
        'transition-shadow duration-[var(--pf-motion-fast)]',
        'hover:border-[var(--pf-border-strong)] hover:shadow-[var(--pf-shadow-sm)]',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]',
        isDragging && 'opacity-50 shadow-[var(--pf-shadow-lg)] rotate-1',
        className,
      )}
    >
      {/* Top row: blocked indicator + approval badge */}
      {(task.isBlocked || task.approvalRequired) && (
        <div className="flex flex-wrap gap-1.5">
          {task.isBlocked && (
            <Badge tone="danger" className="gap-1 text-xs">
              <AlertCircle aria-hidden className="size-3" />
              {t('status.blocked')}
            </Badge>
          )}
          {task.approvalRequired && (
            <Badge tone="pending" className="gap-1 text-xs">
              <BadgeCheck aria-hidden className="size-3" />
              {t('approvalRequired')}
            </Badge>
          )}
        </div>
      )}

      {/* Title */}
      <p className="min-w-0 break-words text-sm font-medium leading-snug">{task.title}</p>

      {task.projectId ? (
        task.clientName ? (
          <p className="truncate text-[0.65rem] text-[var(--pf-text-muted)]">{task.clientName}</p>
        ) : null
      ) : (
        <p className="text-[0.65rem] text-[var(--pf-text-muted)]">{t('noProject')}</p>
      )}

      {/* Labels */}
      {task.labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {task.labels.map((label) => (
            <Badge key={label} tone="brand" className="text-[0.65rem]">
              {label}
            </Badge>
          ))}
        </div>
      )}

      {/* Bottom row */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {/* Left: status + priority + checklist + due date */}
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Status badge */}
          <Badge tone={STATUS_TONE[task.status]} className="text-[0.65rem]">
            {t(`status.${task.status}`)}
          </Badge>

          {/* Priority badge */}
          <Badge tone={PRIORITY_TONE[task.priority]} className="text-[0.65rem]">
            {t(`priority.${PRIORITY_LABEL_KEY[task.priority]}`)}
          </Badge>

          {/* Checklist progress */}
          {task.checklistTotal > 0 && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[0.65rem] font-medium',
                task.checklistDone === task.checklistTotal
                  ? 'text-[var(--pf-status-success-fg)]'
                  : 'text-[var(--pf-text-muted)]',
              )}
            >
              <CheckSquare aria-hidden className="size-3" />
              {task.checklistDone}/{task.checklistTotal}
            </span>
          )}

          {/* Due date */}
          {dueDateLabel && (
            <span
              className={cn(
                'inline-flex items-center gap-0.5 text-[0.65rem]',
                isOverdue
                  ? 'font-semibold text-[var(--pf-status-danger-fg)]'
                  : 'text-[var(--pf-text-muted)]',
              )}
            >
              <Calendar aria-hidden className="size-3" />
              {dueDateLabel}
            </span>
          )}
        </div>

        {/* Right: assignee avatars */}
        <Avatars assignees={task.assignees} />
      </div>

      {/* Bucket name (below fold) — architecture requires showing bucket name alongside status */}
      {task.bucketName && (
        <p className="text-[0.65rem] text-[var(--pf-text-muted)]">
          {t('bucket')}: {task.bucketName}
        </p>
      )}
    </article>
  );
}
