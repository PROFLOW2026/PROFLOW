'use client';

import {
  CheckCircle2,
  ClipboardList,
  FileSignature,
  FileText,
  Flag,
  FolderKanban,
  GitPullRequest,
  History,
  Paperclip,
  Receipt,
  Undo2,
  User,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { Spinner } from '@/components/ui/spinner';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { Switch } from '@/components/ui/switch';
import {
  TIMELINE_CATEGORIES,
  timelineKindMessageKey,
  type ClientTimelineEventView,
  type TimelineCategory,
  type TimelinePresentation,
} from '@/modules/clients/domain/timeline';
import { Link } from '@/shared/i18n/navigation';

const CATEGORY_ICONS: Record<TimelineCategory, LucideIcon> = {
  client: User,
  project: FolderKanban,
  work_order: Wrench,
  quote: FileText,
  contract: FileSignature,
  change: GitPullRequest,
  milestone: Flag,
  billing: Receipt,
  document: Paperclip,
  approval: CheckCircle2,
  correction: Undo2,
};

function presentationShape(presentation: TimelinePresentation): StatusShape | null {
  switch (presentation) {
    case 'void':
      return 'void';
    case 'draft':
      return 'draft';
    case 'approved':
      return 'approved';
    case 'pending':
      return 'pending';
    case 'cancelled':
      return 'cancelled';
    case 'active':
      return 'active';
    default:
      return null;
  }
}

function formatOccurredAt(iso: string, locale: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export interface ClientTimelineProps {
  events?: readonly ClientTimelineEventView[];
  state?: 'ready' | 'loading' | 'error';
}

export function ClientTimeline({ events = [], state = 'ready' }: ClientTimelineProps) {
  const t = useTranslations('clients.detail.timeline');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const [category, setCategory] = useState<TimelineCategory | 'all'>('all');
  const [oldestFirst, setOldestFirst] = useState(false);

  const visible = useMemo(() => {
    const filtered =
      category === 'all' ? [...events] : events.filter((event) => event.category === category);
    return filtered.sort((left, right) => {
      const delta = new Date(left.occurredAt).getTime() - new Date(right.occurredAt).getTime();
      return oldestFirst ? delta : -delta;
    });
  }, [events, category, oldestFirst]);

  return (
    <Card>
      <CardHeader className="gap-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 text-start">
            <CardTitle id="client-timeline-heading">{t('title')}</CardTitle>
            <CardDescription>{t('subtitle')}</CardDescription>
          </div>
          <label className="flex min-h-11 cursor-pointer items-center gap-2 text-sm text-[var(--pf-text-secondary)]">
            <Switch
              checked={oldestFirst}
              onCheckedChange={setOldestFirst}
              aria-label={t('oldestFirst')}
            />
            <span>{oldestFirst ? t('oldestFirst') : t('newestFirst')}</span>
          </label>
        </div>
        <div
          className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
          role="group"
          aria-label={tCommon('actions.filter')}
        >
          <FilterChip
            active={category === 'all'}
            onClick={() => setCategory('all')}
            label={t('filterAll')}
          />
          {TIMELINE_CATEGORIES.map((value) => (
            <FilterChip
              key={value}
              active={category === value}
              onClick={() => setCategory(value)}
              label={t(`categories.${value}`)}
            />
          ))}
        </div>
      </CardHeader>
      <CardContent>
        {state === 'loading' ? (
          <div className="flex flex-col gap-3" aria-busy="true">
            <Spinner label={tCommon('states.loading')} />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-full" />
            <Skeleton className="h-14 w-2/3" />
          </div>
        ) : null}

        {state === 'error' ? (
          <Alert tone="danger" title={tCommon('states.errorTitle')}>
            {t('error')}
          </Alert>
        ) : null}

        {state === 'ready' && visible.length === 0 ? (
          <EmptyState
            icon={History}
            size="sm"
            title={t('empty.title')}
            description={t('empty.body')}
          />
        ) : null}

        {state === 'ready' && visible.length > 0 ? (
          <ol className="flex flex-col gap-0 border-s-2 border-[var(--pf-border-default)] ps-4">
            {visible.map((event) => (
              <TimelineRow key={event.id} event={event} locale={locale} />
            ))}
          </ol>
        ) : null}
      </CardContent>
    </Card>
  );
}

function FilterChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={active ? 'secondary' : 'ghost'}
      aria-pressed={active}
      onClick={onClick}
      className="shrink-0"
    >
      {label}
    </Button>
  );
}

function TimelineRow({ event, locale }: { event: ClientTimelineEventView; locale: string }) {
  const t = useTranslations('clients.detail.timeline');
  const Icon = CATEGORY_ICONS[event.category] ?? ClipboardList;
  const kindKey = timelineKindMessageKey(event.kind);
  const shape = presentationShape(event.presentation);
  const title = t.has(`kinds.${kindKey}`) ? t(`kinds.${kindKey}`) : event.summary;

  return (
    <li className="relative py-3 text-start">
      <span className="absolute -start-[1.4rem] top-4 flex size-6 items-center justify-center rounded-full bg-[var(--pf-teal-50)] text-[var(--pf-teal-700)]">
        <Icon className="size-3.5" aria-hidden />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="font-medium text-[var(--pf-text-primary)]">{title}</p>
          {shape ? <StatusBadge shape={shape} label={t(`presentations.${event.presentation}`)} /> : null}
        </div>
        {event.summary && event.summary !== title ? (
          <p className="text-sm text-[var(--pf-text-secondary)]">{event.summary}</p>
        ) : null}
        <p className="text-xs text-[var(--pf-text-secondary)]">
          <time dateTime={event.occurredAt}>{formatOccurredAt(event.occurredAt, locale)}</time>
          {event.actorName ? (
            <>
              {' · '}
              {t('byActor', { name: event.actorName })}
            </>
          ) : null}
          {event.projectName ? (
            <>
              {' · '}
              {event.projectName}
            </>
          ) : null}
        </p>
        {event.deepLink ? (
          <Link
            href={event.deepLink}
            className="w-fit text-sm font-medium text-[var(--pf-text-brand)] underline-offset-2 hover:underline"
          >
            {t('open')}
          </Link>
        ) : null}
      </div>
    </li>
  );
}
