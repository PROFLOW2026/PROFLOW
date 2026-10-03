import { CalendarClock, MapPin } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { requireExternalContext } from '@/modules/contractor-access';
import { listContractorSchedule, type ContractorEventListItem } from '@/modules/coordination';
import { partyTone, statusTone } from '@/modules/coordination/ui/tones';
import { formatInstant } from '@/shared/dates';
import { EXTERNAL_CAPABILITIES } from '@/shared/external';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

export default async function ContractorSchedulePage({
  params,
  searchParams,
}: {
  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ view?: string }>;
}) {
  const { projectId } = await params;
  const { view } = await searchParams;
  const scope = view === 'past' ? 'past' : 'upcoming';
  const context = await requireExternalContext();
  const covered = context.grants.some(
    (grant) =>
      grant.capabilities.has(EXTERNAL_CAPABILITIES.SCHEDULE_VIEW) && (!grant.projectId || grant.projectId === projectId),
  );
  if (!covered) notFound();

  const items = await listContractorSchedule(context, projectId, { scope });
  const [t, locale] = await Promise.all([getTranslations('coordination'), getLocale()]);
  const base = `/contractor/projects/${projectId}/schedule`;
  const tabClass = (active: boolean) =>
    cn(
      'inline-flex min-h-11 flex-1 items-center justify-center rounded-md px-3 text-sm font-medium sm:flex-none',
      active ? 'bg-[var(--pf-bg-muted)] text-[var(--pf-text-primary)]' : 'text-[var(--pf-text-secondary)]',
    );

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('portal.scheduleTitle')} description={t('portal.scheduleDescription')} />
      <nav className="flex gap-1" aria-label={t('portal.scheduleTitle')}>
        <Link href={base} className={tabClass(scope === 'upcoming')} aria-current={scope === 'upcoming' ? 'page' : undefined}>
          {t('portal.upcoming')}
        </Link>
        <Link href={`${base}?view=past`} className={tabClass(scope === 'past')} aria-current={scope === 'past' ? 'page' : undefined}>
          {t('portal.past')}
        </Link>
      </nav>
      {items.length === 0 ? (
        <EmptyState
          icon={CalendarClock}
          title={scope === 'upcoming' ? t('portal.emptyUpcoming') : t('portal.emptyPast')}
          size="sm"
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {items.map((item) => (
            <li key={item.id}>
              <ScheduleCard item={item} projectId={projectId} locale={locale} t={t} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ScheduleCard({
  item,
  projectId,
  locale,
  t,
}: {
  item: ContractorEventListItem;
  projectId: string;
  locale: string;
  t: Awaited<ReturnType<typeof getTranslations<'coordination'>>>;
}) {
  return (
    <Link href={`/contractor/projects/${projectId}/events/${item.id}`} className="block">
      <Card className="flex flex-col gap-2 p-4 active:bg-[var(--pf-surface-hover)]">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-base font-semibold">{item.title}</span>
          {item.status !== 'scheduled' ? <Badge tone={statusTone(item.status)}>{t(`statuses.${item.status}`)}</Badge> : null}
          {item.needsAttention ? <Badge tone="warning">{t('portal.needsAnswer')}</Badge> : null}
        </div>
        <span className="inline-flex items-center gap-1.5 text-sm text-[var(--pf-text-secondary)]">
          <CalendarClock className="size-4" aria-hidden />
          {formatInstant(item.startsAt, locale, item.timeZone)}
        </span>
        {item.locationName ? (
          <span className="inline-flex items-center gap-1.5 text-sm text-[var(--pf-text-secondary)]">
            <MapPin className="size-4" aria-hidden />
            {item.locationName}
          </span>
        ) : null}
        {item.preparationDeadline && item.status === 'scheduled' ? (
          <span className="text-sm text-[var(--pf-text-secondary)]">
            {t('list.prepareBy', { date: formatInstant(item.preparationDeadline, locale, item.timeZone) })}
          </span>
        ) : null}
        <div className="flex flex-wrap gap-2">
          {item.invitations.map((invitation) => (
            <Badge key={invitation.participantId} tone={partyTone(invitation.latestStatus ?? 'waiting')}>
              {(invitation.tradeLabel ?? invitation.partyName) + ': ' + t(`partyStatus.${invitation.latestStatus ?? 'waiting'}`)}
            </Badge>
          ))}
        </div>
      </Card>
    </Link>
  );
}
