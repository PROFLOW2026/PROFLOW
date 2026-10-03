import { getFormatter, getTranslations } from 'next-intl/server';
import { NotebookPen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { PageHeader } from '@/components/ui/page-header';
import { getDailyLogCalendar } from '@/modules/site-log';
import { loadOrNotFound } from '@/modules/site-log/shared/page-guard';
import { SiteLogDateJump } from '@/modules/site-log/ui/site-log-date-jump';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';

export async function SiteLogScreen({ surfaceRoot,
  params,
  searchParams,
}: {
    surfaceRoot?: string;

  params: Promise<{ projectId: string }>;
  searchParams: Promise<{ to?: string }>;
}) {
  const [{ projectId }, { to }] = await Promise.all([params, searchParams]);
  const [t, format] = await Promise.all([getTranslations('siteOps'), getFormatter()]);
  const calendar = await loadOrNotFound(() =>
    withOrgContext((context) => getDailyLogCalendar(context, projectId, { toDate: to ?? null })),
  );
  const basePath = `${surfaceRoot ?? ('/projects/' + projectId)}/site-log`;

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('siteLog.title')}
        description={t('siteLog.description')}
        actions={
          <Button asChild variant="primary">
            <Link href={`${basePath}/${calendar.today}`}>{t('siteLog.openToday')}</Link>
          </Button>
        }
      />

      <SiteLogDateJump
        basePath={basePath}
        defaultDate={calendar.today}
        maxDate={calendar.today}
        label={t('siteLog.jumpToDate')}
        submitLabel={t('siteLog.open')}
      />

      <ul className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {calendar.days.map((day) => {
          const date = new Date(`${day.logDate}T12:00:00Z`);
          const empty = !day.logId && day.contractorReports === 0;
          return (
            <li key={day.logDate}>
              <Link href={`${basePath}/${day.logDate}`} className="block min-w-0">
                <Card className="h-full transition-colors hover:border-[var(--pf-border-focus)]">
                  <CardContent className="flex min-w-0 flex-col gap-2 p-4">
                    <div className="flex min-w-0 items-center justify-between gap-2">
                      <span className="font-medium">
                        {format.dateTime(date, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })}
                      </span>
                      {day.status === 'closed' ? (
                        <Badge tone="success">{t('siteLog.status.closed')}</Badge>
                      ) : day.logId ? (
                        <Badge tone="info">{t('siteLog.status.open')}</Badge>
                      ) : null}
                    </div>
                    {empty ? (
                      <span className="flex items-center gap-1 text-xs text-[var(--pf-text-muted)]">
                        <NotebookPen className="size-3.5" aria-hidden />
                        {day.logDate === calendar.today ? t('siteLog.startToday') : t('siteLog.noEntries')}
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--pf-text-secondary)]">
                        {t('siteLog.dayCounts', { entries: day.entryCount, reports: day.contractorReports })}
                      </span>
                    )}
                    {day.weather ? <span className="truncate text-xs text-[var(--pf-text-muted)]">{day.weather}</span> : null}
                  </CardContent>
                </Card>
              </Link>
            </li>
          );
        })}
      </ul>

      <nav className="flex items-center justify-between gap-2" aria-label={t('siteLog.pagination')}>
        <Button asChild variant="secondary" size="sm">
          <Link href={`${basePath}?to=${calendar.olderToDate}`}>{t('siteLog.older')}</Link>
        </Button>
        {calendar.newerToDate ? (
          <Button asChild variant="secondary" size="sm">
            <Link href={`${basePath}?to=${calendar.newerToDate}`}>{t('siteLog.newer')}</Link>
          </Button>
        ) : null}
      </nav>
    </div>
  );
}

export default function SiteLogPage(
  props: Omit<Parameters<typeof SiteLogScreen>[0], 'surfaceRoot'>,
) {
  return <SiteLogScreen {...props} />;
}
