import { CalendarClock, MapPin, Users } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
import { formatInstant } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import type { CoordinationEventSummary } from '../domain/types';
import { readinessTone, statusTone } from './tones';

/** Internal list of coordination events (cards on every viewport; readable on mobile). */
export async function CoordinationEventList({
  items,
  projectId,
  locale,
  timeZone,
  basePath,
}: {
  items: readonly CoordinationEventSummary[];
  projectId: string;
  locale: string;
  timeZone: string;
  /** List route. Defaults to the Owner app path. */
  basePath?: string;
}) {
  const t = await getTranslations('coordination');
  const listBase = basePath ?? `/projects/${projectId}/coordination`;
  return (
    <ul className="grid gap-3">
      {items.map((item) => (
        <li key={item.id}>
          <Link
            href={`${listBase}/${item.id}`}
            className="block rounded-xl focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--pf-focus-ring)]"
          >
            <Card className="flex flex-col gap-3 p-4 transition-colors hover:bg-[var(--pf-surface-hover)] md:flex-row md:items-center md:justify-between">
              <div className="flex min-w-0 flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-base font-semibold text-[var(--pf-text-primary)]">{item.title}</span>
                  <Badge tone="neutral">{t(`kinds.${item.kind}`)}</Badge>
                  {item.status !== 'scheduled' ? <Badge tone={statusTone(item.status)}>{t(`statuses.${item.status}`)}</Badge> : null}
                </div>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-[var(--pf-text-secondary)]">
                  <span className="inline-flex items-center gap-1.5">
                    <CalendarClock className="size-4" aria-hidden />
                    {formatInstant(item.startsAt, locale, timeZone)}
                  </span>
                  {item.locationName || item.locationNote ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="size-4" aria-hidden />
                      {[item.locationName, item.locationNote].filter(Boolean).join(' · ')}
                    </span>
                  ) : null}
                  <span className="inline-flex items-center gap-1.5">
                    <Users className="size-4" aria-hidden />
                    {t('list.contractorCount', { count: item.contractorCount })}
                  </span>
                  {item.preparationDeadline && item.status === 'scheduled' ? (
                    <span>{t('list.prepareBy', { date: formatInstant(item.preparationDeadline, locale, timeZone) })}</span>
                  ) : null}
                </div>
              </div>
              {item.status === 'scheduled' ? (
                <div className="flex shrink-0 flex-wrap items-center gap-2">
                  <Badge tone={readinessTone(item.readiness)}>{t(`readiness.${item.readiness}`)}</Badge>
                  {item.overridden ? <Badge tone="neutral">{t('readiness.overridden')}</Badge> : null}
                  {item.requiredCount > 0 ? (
                    <span className="text-sm text-[var(--pf-text-secondary)]">
                      {t('list.readyCount', { ready: item.requiredReadyCount, total: item.requiredCount })}
                    </span>
                  ) : null}
                </div>
              ) : null}
            </Card>
          </Link>
        </li>
      ))}
    </ul>
  );
}
