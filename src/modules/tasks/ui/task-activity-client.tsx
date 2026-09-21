'use client';

/**
 * Client component: collapsible wrapper for the task activity feed.
 * Shows a compact slice initially, expands to full list on demand.
 */

import { useState } from 'react';
import {
  Activity,
  AlertCircle,
  ArchiveIcon,
  Bot,
  CalendarDays,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  CircleDot,
  Flag,
  LinkIcon,
  MessageSquare,
  Paperclip,
  RefreshCw,
  Settings2,
  Tag,
  UserPlus,
  XCircle,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/** Serializable row — all display strings resolved on the server. */
export type TaskActivityViewRow = {
  id: string;
  eventType: string;
  createdAtIso: string;
  formattedTime: string;
  isSystem: boolean;
  actorLabel: string;
  eventLabel: string;
  summaryText: string | null;
  diffFrom: string | null;
  diffTo: string | null;
};

interface ActivityExpandClientProps {
  allEvents: TaskActivityViewRow[];
  compactCount: number;
  showLessLabel: string;
  showAllLabel: string;
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
      return (
        <CheckCircle
          className="size-3.5 shrink-0 text-[var(--pf-status-success-fg)]"
          aria-hidden
        />
      );
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

function ActivityPayloadDisplay({ row }: { row: TaskActivityViewRow }) {
  const { summaryText, diffFrom, diffTo } = row;

  if (summaryText && !diffFrom) {
    return (
      <span className="text-[var(--pf-text-muted)]">
        {' '}
        <span className="font-medium">{summaryText}</span>
      </span>
    );
  }

  if (!diffFrom) return null;

  return (
    <span className="text-[var(--pf-text-muted)]">
      {summaryText ? (
        <>
          {' '}
          <span className="font-medium">{summaryText}:</span>
        </>
      ) : null}{' '}
      <span className="font-medium">{diffFrom}</span>
      {' → '}
      <span className="font-medium">{diffTo}</span>
    </span>
  );
}

function ActivityEventRowView({ row }: { row: TaskActivityViewRow }) {
  return (
    <li className="flex items-start gap-2.5 py-1.5">
      <span
        className={[
          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full',
          row.isSystem
            ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-muted)]'
            : 'bg-[var(--pf-bg-subtle)] text-[var(--pf-text-secondary)]',
        ].join(' ')}
      >
        {eventIcon(row.eventType)}
      </span>

      <div className="min-w-0 flex-1">
        <p className="text-sm leading-snug">
          {row.isSystem ? (
            <span className="font-medium text-[var(--pf-text-muted)]">{row.actorLabel}</span>
          ) : (
            <span className="font-medium">{row.actorLabel}</span>
          )}
          {' '}
          <span className="text-[var(--pf-text-secondary)]">{row.eventLabel}</span>
          <ActivityPayloadDisplay row={row} />
        </p>
        <time dateTime={row.createdAtIso} className="text-xs text-[var(--pf-text-muted)]">
          {row.formattedTime}
        </time>
      </div>
    </li>
  );
}

export function ActivityExpandClient({
  allEvents,
  compactCount,
  showLessLabel,
  showAllLabel,
}: ActivityExpandClientProps) {
  const [expanded, setExpanded] = useState(false);
  const visibleEvents = expanded ? allEvents : allEvents.slice(0, compactCount);

  return (
    <div className="flex flex-col gap-2">
      <ol className="relative flex flex-col border-s border-[var(--pf-border-subtle)] ps-4">
        {visibleEvents.map((event) => (
          <ActivityEventRowView key={event.id} row={event} />
        ))}
      </ol>

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => setExpanded((prev) => !prev)}
        className="self-start"
      >
        {expanded ? (
          <>
            <ChevronUp className="size-4" aria-hidden />
            {showLessLabel}
          </>
        ) : (
          <>
            <ChevronDown className="size-4" aria-hidden />
            {showAllLabel}
          </>
        )}
      </Button>
    </div>
  );
}
