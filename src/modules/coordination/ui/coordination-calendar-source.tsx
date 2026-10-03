import { CalendarClock, MapPin } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { withOrgContext } from '@/shared/auth/session';
import { formatInstant } from '@/shared/dates';
import { Link } from '@/shared/i18n/navigation';
import { logger } from '@/shared/observability/logger';
import { listCoordinationCalendarItems } from '../application/queries';
import { calendarWindow } from '../domain/constants';
import { readinessTone, statusTone } from './tones';

/**
 * Coordination events as a source on the existing project calendar / timeline pages. Renders nothing
 * when the viewer has no coordination capability or there are no events in the window, so the
 * task-based calendar keeps working unchanged.
 */
export async function CoordinationCalendarSource({
  projectId,
  daysBack = 1,
  daysAhead = 45,
}: {
  projectId: string;
  daysBack?: number;
  daysAhead?: number;
}) {
  const range = calendarWindow(daysBack, daysAhead);
  let data: { timeZone: string; items: Awaited<ReturnType<typeof listCoordinationCalendarItems>> };
  try {
    data = await withOrgContext(async (context) => ({
      timeZone: context.organization.timezone,
      items: await listCoordinationCalendarItems(context, projectId, { ...range, limit: 20 }),
    }));
  } catch (error) {
    unstable_rethrow(error);
    // An optional source must never take down the host calendar page (e.g. before migration 0161 is applied).
    logger.error('coordination.calendar_source_failed', { projectId, error: String(error) });
    return null;
  }
  if (data.items.length === 0) return null;
  const [t, locale] = await Promise.all([getTranslations('coordination'), getLocale()]);

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-2">
        <div>
          <CardTitle>{t('calendar.sectionTitle')}</CardTitle>
          <CardDescription>{t('calendar.sectionDescription')}</CardDescription>
        </div>
        <Link
          href={`/projects/${projectId}/coordination`}
          className="text-sm font-medium text-[var(--pf-text-brand)] underline-offset-4 hover:underline"
        >
          {t('calendar.viewAll')}
        </Link>
      </CardHeader>
      <CardContent>
        <ul className="flex flex-col divide-y divide-[var(--pf-border-default)]">
          {data.items.map((item) => (
            <li key={item.id}>
              <Link
                href={`/projects/${projectId}/coordination/${item.id}`}
                className="flex min-h-11 flex-col gap-1 py-2 sm:flex-row sm:items-center sm:justify-between"
              >
                <span className="flex min-w-0 flex-col">
                  <span className="truncate font-medium text-[var(--pf-text-primary)]">{item.title}</span>
                  <span className="flex flex-wrap gap-x-3 text-xs text-[var(--pf-text-secondary)]">
                    <span className="inline-flex items-center gap-1">
                      <CalendarClock className="size-3.5" aria-hidden />
                      {formatInstant(item.startsAt, locale, data.timeZone)}
                    </span>
                    {item.locationName ? (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden />
                        {item.locationName}
                      </span>
                    ) : null}
                  </span>
                </span>
                {item.status === 'scheduled' ? (
                  <Badge tone={readinessTone(item.readiness)}>{t(`readiness.${item.readiness}`)}</Badge>
                ) : (
                  <Badge tone={statusTone(item.status)}>{t(`statuses.${item.status}`)}</Badge>
                )}
              </Link>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}
