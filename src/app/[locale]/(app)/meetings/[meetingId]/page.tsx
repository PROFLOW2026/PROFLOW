import type { Metadata } from 'next';
import {
  MainAppPage,
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import { getLocale, getTranslations } from 'next-intl/server';
import { intlDateTimeFormat } from '@/shared/i18n/intl-locale';
import { notFound } from 'next/navigation';
import {
  Calendar,
  CheckSquare,
  ChevronLeft,
  ClipboardList,
  ExternalLink,
  MapPin,
  Users,
} from 'lucide-react';
import { PageHeader } from '@/components/ui/page-header';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { getMeetingDetailById } from '@/modules/meetings';
import type { MeetingActionItem, MeetingDecision } from '@/modules/meetings';
import { withOrgContext, getShellContext } from '@/shared/auth/session';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; meetingId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'tasks' });
  return { title: t('meetings.detailPageTitle') };
}

interface MeetingDetailPageProps {
  params: Promise<{ locale: string; meetingId: string }>;
}

export default async function MeetingDetailPage({ params }: MeetingDetailPageProps) {
  const shell = await getShellContext();

  if (!shell?.permissions.has(PERMISSIONS.MEETINGS_READ)) {
    notFound();
  }

  const { meetingId } = await params;
  const [t, tCommon, locale] = await Promise.all([
    getTranslations('tasks'),
    getTranslations('common'),
    getLocale(),
  ]);
  const canManage = shell.permissions.has(PERMISSIONS.MEETINGS_MANAGE);
  const canCreateTasks = shell.permissions.has(PERMISSIONS.TASKS_CREATE);

  let detail;
  try {
    detail = await withOrgContext((context) => getMeetingDetailById(context, meetingId));
  } catch {
    notFound();
  }

  return (
    <MainAppPage>
      {/* Breadcrumb */}
      <nav className="flex min-w-0 items-center gap-1 text-sm text-[var(--pf-text-secondary)]">
        <Link href="/meetings" className="flex items-center gap-1 hover:text-[var(--pf-text-primary)]">
          <ChevronLeft className="h-3 w-3" aria-hidden />
          {t('meetings.pageTitle')}
        </Link>
        <span>/</span>
        <span className="min-w-0 truncate text-[var(--pf-text-primary)]">{detail.title}</span>
      </nav>

      <PageHeader
        title={detail.title}
        description={
          <div className="flex min-w-0 flex-wrap items-center gap-3 text-sm text-[var(--pf-text-secondary)]">
            <span className="flex items-center gap-1">
              <Calendar className="h-3.5 w-3.5 shrink-0" aria-hidden />
              {formatFullDate(detail.scheduledAt, locale)}
            </span>
            {detail.location && (
              <span className="flex min-w-0 items-center gap-1">
                <MapPin className="h-3.5 w-3.5 shrink-0" aria-hidden />
                {detail.location}
              </span>
            )}
            {(detail.projectName || detail.workspaceName) && (
              <span className="min-w-0">
                {detail.projectName ? (
                  <Link href={`/projects/${detail.projectId}`} className="hover:underline">
                    {detail.projectName}
                  </Link>
                ) : (
                  detail.workspaceName
                )}
              </span>
            )}
          </div>
        }
        actions={
          canManage ? (
            <Button asChild variant="secondary">
              <Link href={`/meetings/${meetingId}/edit`} prefetch={false}>
                {t('meetings.detail.editMeeting')}
              </Link>
            </Button>
          ) : undefined
        }
      />

      <MainAppSection>
        <MainAppSummaryGrid>
          <MainAppSummaryItem label={t('meetings.fields.attendees')}>
            {detail.attendees.length}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('meetings.fields.decisions')}>
            {detail.decisions.length}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('meetings.fields.actionItems')}>
            {detail.actionItems.length}
          </MainAppSummaryItem>
          <MainAppSummaryItem label={t('meetings.fields.date')}>
            <span className="pf-ltr-island" dir="ltr">
              {formatFullDate(detail.scheduledAt, locale)}
            </span>
          </MainAppSummaryItem>
        </MainAppSummaryGrid>
      </MainAppSection>

      {detail.notes ? (
        <MainAppSection title={t('meetings.fields.notes')}>
          <p className="whitespace-pre-wrap text-sm text-[var(--pf-text-secondary)]">{detail.notes}</p>
        </MainAppSection>
      ) : null}

      <MainAppSection
        title={
          <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
            <Users className="h-4 w-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
            {t('meetings.fields.attendees')} ({detail.attendees.length})
          </span>
        }
        actions={
          canManage ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/meetings/${meetingId}/attendees/add`} prefetch={false}>
                {t('meetings.detail.addAttendee')}
              </Link>
            </Button>
          ) : undefined
        }
      >
        {detail.attendees.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('meetings.detail.noAttendees')}</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {detail.attendees.map((attendee) => (
              <span
                key={attendee.id}
                className="inline-flex max-w-full items-center rounded-full bg-[var(--pf-badge-bg)] px-3 py-1 text-sm"
              >
                {attendee.resolvedName ?? attendee.displayName ?? t('meetings.attendee.unknown')}
                {attendee.orgMemberId && (
                  <span className="ms-1 text-xs text-[var(--pf-text-muted)]">{t('meetings.attendee.member')}</span>
                )}
                {attendee.employeeId && (
                  <span className="ms-1 text-xs text-[var(--pf-text-muted)]">{t('meetings.attendee.employee')}</span>
                )}
                {attendee.contactId && (
                  <span className="ms-1 text-xs text-[var(--pf-text-muted)]">{t('meetings.attendee.contact')}</span>
                )}
              </span>
            ))}
          </div>
        )}
      </MainAppSection>

      {/* Decisions are canonical records, NOT tasks. Action items may optionally create/link tasks. */}
      <MainAppSection
        title={
          <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
            <CheckSquare className="h-4 w-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
            {t('meetings.detail.decisionsHeading', { count: detail.decisions.length })}
            <span className="rounded bg-blue-50 px-1.5 py-0.5 text-xs font-medium text-blue-700 dark:bg-blue-950 dark:text-blue-300">
              {t('meetings.detail.canonicalBadge')}
            </span>
          </span>
        }
        actions={
          canManage ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/meetings/${meetingId}/decisions/new`} prefetch={false}>
                {t('meetings.detail.addDecision')}
              </Link>
            </Button>
          ) : undefined
        }
      >
        {detail.decisions.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('meetings.detail.noDecisionsYet')}</p>
        ) : (
          <ul className="min-w-0 space-y-3">
            {detail.decisions.map((decision) => (
              <DecisionItem
                key={decision.id}
                decision={decision}
                meetingId={meetingId}
                canManage={canManage}
                locale={locale}
                editLabel={tCommon('actions.edit')}
                decidedAtLabel={(date) => t('meetings.detail.decidedAt', { date })}
              />
            ))}
          </ul>
        )}
      </MainAppSection>

      <MainAppSection
        title={
          <span className="inline-flex min-w-0 flex-wrap items-center gap-2">
            <ClipboardList className="h-4 w-4 shrink-0 text-[var(--pf-text-secondary)]" aria-hidden />
            {t('meetings.detail.actionItemsHeading', { count: detail.actionItems.length })}
          </span>
        }
        actions={
          canManage ? (
            <Button asChild size="sm" variant="ghost">
              <Link href={`/meetings/${meetingId}/action-items/new`} prefetch={false}>
                {t('meetings.detail.addActionItem')}
              </Link>
            </Button>
          ) : undefined
        }
      >
        {detail.actionItems.length === 0 ? (
          <p className="text-sm text-[var(--pf-text-muted)]">{t('meetings.detail.noActionItemsYet')}</p>
        ) : (
          <ul className="min-w-0 space-y-2">
            {detail.actionItems.map((item) => (
              <ActionItemRow
                key={item.id}
                item={item}
                meetingId={meetingId}
                canManage={canManage}
                canCreateTasks={canCreateTasks}
                t={t}
                editLabel={tCommon('actions.edit')}
              />
            ))}
          </ul>
        )}
      </MainAppSection>
    </MainAppPage>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DecisionItem({
  decision,
  meetingId,
  canManage,
  locale,
  editLabel,
  decidedAtLabel,
}: {
  decision: MeetingDecision;
  meetingId: string;
  canManage: boolean;
  locale: string;
  editLabel: string;
  decidedAtLabel: (date: string) => string;
}) {
  return (
    <li className="min-w-0 rounded-md border border-[var(--pf-border)] p-3">
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{decision.title}</p>
          {decision.body && (
            <p className="mt-1 whitespace-pre-wrap text-sm text-[var(--pf-text-secondary)]">
              {decision.body}
            </p>
          )}
          {decision.decidedAt && (
            <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
              {decidedAtLabel(formatShortDate(decision.decidedAt, locale))}
            </p>
          )}
        </div>
        {canManage && (
          <Button asChild size="sm" variant="ghost" className="shrink-0">
            <Link href={`/meetings/${meetingId}/decisions/${decision.id}/edit`} prefetch={false}>
              {editLabel}
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

function ActionItemRow({
  item,
  meetingId,
  canManage,
  canCreateTasks,
  t,
  editLabel,
}: {
  item: MeetingActionItem;
  meetingId: string;
  canManage: boolean;
  canCreateTasks: boolean;
  t: Awaited<ReturnType<typeof getTranslations<'tasks'>>>;
  editLabel: string;
}) {
  const statusTone: Record<string, 'info' | 'success' | 'neutral'> = {
    open: 'info',
    done: 'success',
    cancelled: 'neutral',
  };

  return (
    <li className="flex min-w-0 items-start gap-3 rounded-md border border-[var(--pf-border)] p-3">
      <Badge tone={statusTone[item.status] ?? 'info'} className="mt-0.5 shrink-0 capitalize">
        {t(`meetings.actionItem.status.${item.status}`)}
      </Badge>

      <div className="min-w-0 flex-1">
        <p className={`text-sm font-medium ${item.status === 'done' ? 'line-through text-[var(--pf-text-muted)]' : ''}`}>
          {item.title}
        </p>
        {item.dueDate && (
          <p className="mt-0.5 text-xs text-[var(--pf-text-secondary)]">
            {t('meetings.detail.due', { date: item.dueDate })}
          </p>
        )}

        {item.taskId && (
          <Link
            href={`/tasks/${item.taskId}`}
            className="mt-1 inline-flex items-center gap-1 text-xs text-[var(--pf-accent)] hover:underline"
          >
            <ExternalLink className="h-3 w-3" aria-hidden />
            {t('meetings.detail.viewLinkedTask')}
          </Link>
        )}
      </div>

      <div className="flex shrink-0 flex-wrap gap-1">
        {canManage && canCreateTasks && !item.taskId && item.status === 'open' && (
          <Button asChild size="sm" variant="ghost">
            <Link
              href={`/meetings/${meetingId}/action-items/${item.id}/create-task`}
              prefetch={false}
              title={t('meetings.detail.createTaskTooltip')}
            >
              {t('meetings.detail.taskButton')}
            </Link>
          </Button>
        )}
        {canManage && (
          <Button asChild size="sm" variant="ghost">
            <Link
              href={`/meetings/${meetingId}/action-items/${item.id}/edit`}
              prefetch={false}
            >
              {editLabel}
            </Link>
          </Button>
        )}
      </div>
    </li>
  );
}

function formatFullDate(date: Date, locale: string): string {
  return intlDateTimeFormat(locale, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatShortDate(date: Date, locale: string): string {
  return intlDateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(date);
}
