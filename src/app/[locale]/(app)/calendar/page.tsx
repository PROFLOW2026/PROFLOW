import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CalendarRange } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { Alert } from '@/components/ui/alert';
import { listCalendar } from '@/modules/calendar';
import { addDays, businessDate, endOfMonth, startOfMonth, todayInTimeZone } from '@/shared/dates';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { CalendarEventForm } from './event-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'calendar' });
  return { title: t('title') };
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ view?: string; month?: string }>;
}) {
  const t = await getTranslations('calendar');
  const shell = await getShellContext();
  if (!shell?.permissions.has(PERMISSIONS.SCHEDULING_READ)) {
    return (
      <EmptyState icon={CalendarRange} title={t('notAllowed.title')} description={t('notAllowed.body')} />
    );
  }

  const params = await searchParams;
  const view = params.view === 'agenda' ? 'agenda' : 'month';
  const canManage = shell.permissions.has(PERMISSIONS.SCHEDULING_MANAGE);

  const board = await withOrgContext(async (context) => {
    const today = todayInTimeZone(context.organization.timezone);
    const monthAnchor =
      params.month && /^\d{4}-\d{2}$/.test(params.month)
        ? businessDate(`${params.month}-01`)
        : startOfMonth(today);
    const from = startOfMonth(monthAnchor);
    const to = endOfMonth(monthAnchor);
    try {
      return await listCalendar(context, { from, to, view });
    } catch {
      return {
        from,
        to,
        view,
        items: [],
        providers: [
          { providerKey: 'google' as const, status: 'unconfigured' as const, lastError: null },
          { providerKey: 'microsoft' as const, status: 'unconfigured' as const, lastError: null },
        ],
      };
    }
  });

  const monthKey = board.from.slice(0, 7);
  const prevMonth = addDays(startOfMonth(businessDate(board.from)), -1).slice(0, 7);
  const nextMonth = addDays(endOfMonth(businessDate(board.from)), 1).slice(0, 7);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          <div className="flex flex-wrap gap-2">
            <Button asChild variant={view === 'month' ? 'primary' : 'secondary'} size="sm">
              <Link href={`/calendar?view=month&month=${monthKey}`}>{t('view.month')}</Link>
            </Button>
            <Button asChild variant={view === 'agenda' ? 'primary' : 'secondary'} size="sm">
              <Link href={`/calendar?view=agenda&month=${monthKey}`}>{t('view.agenda')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/calendar?view=${view}&month=${prevMonth}`}>{t('view.previous')}</Link>
            </Button>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/calendar?view=${view}&month=${nextMonth}`}>{t('view.next')}</Link>
            </Button>
          </div>
        }
      />

      <Alert tone="info">{t('external.unconfigured')}</Alert>

      {canManage ? <CalendarEventForm /> : null}

      {board.items.length === 0 ? (
        <EmptyState icon={CalendarRange} title={t('empty.title')} description={t('empty.body')} />
      ) : (
        <ul className="flex flex-col gap-2">
          {board.items.map((item) => (
            <li
              key={item.id}
              className="rounded-md border border-[var(--pf-border-default)] px-3 py-2 text-sm"
            >
              <span className="font-medium">{item.date}</span>
              {' · '}
              {t(`kinds.${item.kind}`)}
              {' · '}
              {item.title}
              <span className="ms-2 text-[var(--pf-text-muted)]">{t(`source.${item.source}`)}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
