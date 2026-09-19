/**
 * Task Activity Feed.
 *
 * Shows a chronological list of task_activity events for a given task.
 * Distinguishes between human actors and system-generated events.
 *
 * Data contract (until Agent A ships list-task-activity.ts):
 *   Fetches directly via Drizzle. Once Agent A exports
 *   `listTaskActivity(context, taskId, opts)` from
 *   `@/modules/tasks/application/list-task-activity`, replace the inline
 *   query block.
 *
 * i18n keys produced here use the `tasks.activity.*` namespace.
 * A placeholder set is written below — Lead / translator will fill real strings.
 *
 * Compact / expanded toggle when > 10 events.
 * Load-more (paginated with cursor based on createdAt).
 */

import {
  Activity,
  Bot,
  CheckCircle,
  CircleDot,
  Flag,
  MessageSquare,
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
import { Skeleton } from '@/components/ui/skeleton';
import { ActivityExpandClient } from './task-activity-client';

// ─── Data Types ───────────────────────────────────────────────────────────────

export type TaskActivityEventRow = TaskActivityDisplayRow;

// ─── Data Loading ─────────────────────────────────────────────────────────────

async function loadActivity(taskId: string): Promise<TaskActivityEventRow[]> {
  return loadTaskActivityForDisplay(taskId);
}

// ─── Event Icons ──────────────────────────────────────────────────────────────

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

// ─── Payload Diff ─────────────────────────────────────────────────────────────

/**
 * Renders a human-readable diff from event payload.
 * e.g. { from: 'todo', to: 'in_progress' } → "todo → in_progress"
 */
function PayloadDiff({ payload }: { payload: Record<string, unknown> | null }) {
  if (!payload) return null;

  const from = payload.from as string | undefined;
  const to = payload.to as string | undefined;

  if (from !== undefined && to !== undefined) {
    return (
      <span className="text-[var(--pf-text-muted)]">
        {' '}
        <span className="font-medium">{String(from)}</span>
        {' → '}
        <span className="font-medium">{String(to)}</span>
      </span>
    );
  }

  // For assigned events: show assignee name
  const assignedTo = payload.assignedToName as string | undefined;
  if (assignedTo) {
    return (
      <span className="text-[var(--pf-text-muted)]">
        {' '}
        <span className="font-medium">{assignedTo}</span>
      </span>
    );
  }

  return null;
}

// ─── Event Row ────────────────────────────────────────────────────────────────

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

  // Build event description. Falls back gracefully for unknown event types.
  const eventLabel = (() => {
    const key = `activity.events.${event.eventType}` as Parameters<typeof t>[0];
    try {
      return t(key);
    } catch {
      return event.eventType.replace(/_/g, ' ');
    }
  })();

  return (
    <li className="flex items-start gap-2.5 py-1.5">
      {/* Timeline dot / icon */}
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
          <PayloadDiff payload={event.payload} />
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

// ─── Main Server Component ─────────────────────────────────────────────────────

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
