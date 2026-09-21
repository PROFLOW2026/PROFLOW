/**
 * Task Activity Feed.
 *
 * Shows a chronological list of task_activity events for a given task.
 * Distinguishes between human actors and system-generated events.
 */

import {
  Activity,
  Bot,
  CheckCircle,
  CircleDot,
  Flag,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Tag,
  UserPlus,
  XCircle,
  AlertCircle,
  ArchiveIcon,
  LinkIcon,
  CalendarDays,
  Settings2,
} from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import {
  loadTaskActivityForDisplay,
  type TaskActivityDisplayRow,
} from '@/modules/tasks/application/load-task-activity-for-display';
import {
  formatActivityDiff,
  formatActivityPayloadSummary,
  resolveActivityEventLabelKey,
} from './format-task-activity-display';
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityExpandClient } from './task-activity-client';

export type TaskActivityEventRow = TaskActivityDisplayRow;

async function loadActivity(taskId: string): Promise<TaskActivityEventRow[]> {
  return loadTaskActivityForDisplay(taskId);
}

function eventIcon(eventType: string) {
  switch (eventType) {
    case 'created':
      return <CircleDot className="size-3.5 shrink-0" aria-hidden />;
    case 'status_changed':
      return <RefreshCw className="size-3.5 shrink-0" aria-hidden />;
    case 'bucket_changed':
      return <Activity className="size-3.5 shrink-0" aria-hidden />;
    case 'assigned':
      return <UserPlus className="size-3.5 shrink-0" aria-hidden />;
    case 'due_date_changed':
      return <CalendarDays className="size-3.5 shrink-0" aria-hidden />;
    case 'priority_changed':
      return <Flag className="size-3.5 shrink-0" aria-hidden />;
    case 'comment_added':
      return <MessageSquare className="size-3.5 shrink-0" aria-hidden />;
    case 'attachment_added':
    case 'attachment_removed':
      return <Paperclip className="size-3.5 shrink-0" aria-hidden />;
    case 'checklist_completed':
      return <CheckCircle className="size-3.5 shrink-0" aria-hidden />;
    case 'approval_result':
      return <AlertCircle className="size-3.5 shrink-0" aria-hidden />;
    case 'dependency_added':
    case 'dependency_removed':
      return <LinkIcon className="size-3.5 shrink-0" aria-hidden />;
    case 'completed':
      return <CheckCircle className="size-3.5 shrink-0 text-[var(--pf-status-success-fg)]" aria-hidden />;
    case 'reopened':
      return <XCircle className="size-3.5 shrink-0" aria-hidden />;
    case 'archived':
      return <ArchiveIcon className="size-3.5 shrink-0" aria-hidden />;
    case 'label_added':
      return <Tag className="size-3.5 shrink-0" aria-hidden />;
    case 'recurrence_generated':
    case 'automation_changed':
    case 'system_generated':
      return <Bot className="size-3.5 shrink-0 text-[var(--pf-text-muted)]" aria-hidden />;
    default:
      return <Settings2 className="size-3.5 shrink-0" aria-hidden />;
  }
}

function PayloadDiff({
  eventType,
  payload,
  t,
}: {
  eventType: string;
  payload: Record<string, unknown> | null;
  t: Awaited<ReturnType<typeof getTranslations<'tasks'>>>;
}) {
  const summary = formatActivityPayloadSummary(eventType, payload, (key, values) =>
    t(key as Parameters<typeof t>[0], values as never),
  );
  const diff = formatActivityDiff(eventType, payload, (key, values) =>
    t(key as Parameters<typeof t>[0], values as never),
  );

  if (summary && !diff) {
    return (
      <span className="text-[var(--pf-text-muted)]">
        {' '}
        <span className="font-medium">{summary}</span>
      </span>
    );
  }

  if (!diff) return null;

  return (
    <span className="text-[var(--pf-text-muted)]">
      {summary ? (
        <>
          {' '}
          <span className="font-medium">{summary}:</span>
        </>
      ) : null}{' '}
      <span className="font-medium">{diff.from}</span>
      {' → '}
      <span className="font-medium">{diff.to}</span>
    </span>
  );
}

function ActivityEventRow({
  event,
  t,
}: {
  event: TaskActivityEventRow;
  t: Awaited<ReturnType<typeof getTranslations<'tasks'>>>;
}) {
  const isSystem = event.actorSystem;
  const actorLabel = isSystem
    ? t('activity.systemActor')
    : (event.actorName ?? t('activity.unknownActor'));

  const eventLabelKey = resolveActivityEventLabelKey(event.eventType);
  const eventLabel = t(eventLabelKey);

  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span
        className={[
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
          isSystem
            ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-muted)]'
            : 'bg-[var(--pf-bg-subtle)] text-[var(--pf-text-secondary)]',
        ].join(' ')}
      >
        {eventIcon(event.eventType)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          {isSystem ? (
            <span className="font-medium text-[var(--pf-text-muted)]">{actorLabel}</span>
          ) : (
            <span className="font-medium">{actorLabel}</span>
          )}
          {' '}
          <span className="text-[var(--pf-text-secondary)]">{eventLabel}</span>
          <PayloadDiff eventType={event.eventType} payload={event.payload} t={t} />
        </p>
        <time
          dateTime={event.createdAt.toISOString()}
          className="text-xs text-[var(--pf-text-muted)]"
        >
          {new Intl.DateTimeFormat(undefined, {
            dateStyle: 'medium',
            timeStyle: 'short',
          }).format(event.createdAt)}
        </time>
      </div>
    </li>
  );
}

const COMPACT_THRESHOLD = 10;

interface TaskActivityProps {
  taskId: string;
}

export async function TaskActivity({ taskId }: TaskActivityProps) {
  const [events, t] = await Promise.all([
    loadActivity(taskId),
    getTranslations('tasks'),
  ]);

  const needsExpander = events.length > COMPACT_THRESHOLD;

  return (
    <section aria-label={t('activity.sectionLabel')} className="flex flex-col gap-3">
      <h3 className="text-sm font-semibold text-[var(--pf-text-secondary)]">
        {t('activity.sectionLabel')}
      </h3>

      {events.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-muted)]">{t('activity.empty')}</p>
      ) : needsExpander ? (
        <ActivityExpandClient
          allEvents={events}
          compactCount={COMPACT_THRESHOLD}
          showLessLabel={t('activity.showLess')}
          showAllLabel={t('activity.showAll', { count: events.length })}
          renderRow={(event) => <ActivityEventRow key={event.id} event={event} t={t} />}
        />
      ) : (
        <ol className="relative flex flex-col border-s border-[var(--pf-border-subtle)] ps-4">
          {events.map((event) => (
            <ActivityEventRow key={event.id} event={event} t={t} />
          ))}
        </ol>
      )}
    </section>
  );
}

export function TaskActivitySkeleton() {
  return (
    <section className="flex flex-col gap-3">
      <Skeleton className="h-4 w-28" />
      <div className="flex flex-col gap-3">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="flex items-start gap-2.5">
            <Skeleton className="size-5 shrink-0 rounded-full" />
            <div className="flex-1 space-y-1">
              <Skeleton className="h-3 w-48" />
              <Skeleton className="h-2.5 w-24" />
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
