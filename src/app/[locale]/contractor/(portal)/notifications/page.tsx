import type { Metadata } from 'next';
import { Bell } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import {
  markAllPortalNotificationsReadAction,
  markPortalNotificationReadAction,
} from '@/modules/contractor-portal/application/actions';
import { loadPortalSession } from '@/modules/contractor-portal/application/load-portal-session';
import { PORTAL_NOTIFICATION_SOURCE } from '@/modules/contractor-portal/application/registry';
import type { PortalNotificationPage } from '@/modules/contractor-portal/domain/notifications';
import { isLivePortalHref } from '@/modules/contractor-portal/domain/routes';
import {
  employeeListPanelClass,
  employeeListRowLinkClass,
  employeePageStackClass,
  employeeSecondaryButtonClass,
} from '@/modules/employee-app/ui/employee-surface-styles';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

const PAGE_SIZE = 30;

interface PageProps {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ cursor?: string | string[] }>;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'contractorPortal' });
  return { title: t('notifications.title') };
}

const SEVERITY_SHAPE = {
  info: 'active',
  warning: 'pending',
  urgent: 'overdue',
} as const satisfies Record<string, StatusShape>;

export default async function ContractorPortalNotificationsPage({ searchParams }: PageProps) {
  const t = await getTranslations('contractorPortal');
  const locale = await getLocale();
  const { context } = await loadPortalSession();
  const rawCursor = (await searchParams).cursor;
  const cursor = typeof rawCursor === 'string' && rawCursor.length <= 200 ? rawCursor : null;

  const page: PortalNotificationPage = PORTAL_NOTIFICATION_SOURCE
    ? await PORTAL_NOTIFICATION_SOURCE.list(context, { limit: PAGE_SIZE, cursor })
    : { items: [], unreadCount: 0, nextCursor: null };

  const timeFormat = new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' });

  return (
    <div className={employeePageStackClass}>
      <header className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-xl font-bold">{t('notifications.title')}</h1>
          <p className="text-sm text-[var(--pf-text-secondary)]">
            {page.unreadCount > 0
              ? t('notifications.unreadSummary', { count: page.unreadCount })
              : t('notifications.subtitle')}
          </p>
        </div>
        {page.unreadCount > 0 ? (
          <form action={markAllPortalNotificationsReadAction}>
            <button type="submit" className={employeeSecondaryButtonClass}>
              {t('notifications.markAllRead')}
            </button>
          </form>
        ) : null}
      </header>

      {page.items.length === 0 ? (
        <EmptyState icon={Bell} title={t('notifications.empty.title')} description={t('notifications.empty.description')} />
      ) : (
        <ul className={employeeListPanelClass}>
          {page.items.map((item) => {
            const unread = item.readAt === null;
            const href = isLivePortalHref(item.href) ? item.href : null;
            const body = (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className={cn('text-sm', unread ? 'font-semibold' : 'font-medium')}>{item.title}</p>
                  {item.body ? <p className="text-xs text-[var(--pf-text-secondary)]">{item.body}</p> : null}
                  <p className="mt-0.5 text-xs text-[var(--pf-text-muted)]">
                    {timeFormat.format(new Date(item.createdAt))}
                  </p>
                </div>
                <StatusBadge
                  shape={SEVERITY_SHAPE[item.severity]}
                  label={t(`notifications.severity.${item.severity}`)}
                />
              </div>
            );
            return (
              <li key={item.id} className={cn(unread && 'bg-[var(--pf-accent-soft)]/40')}>
                {href ? (
                  <Link href={href} className={employeeListRowLinkClass}>
                    {body}
                  </Link>
                ) : unread ? (
                  <form action={markPortalNotificationReadAction.bind(null, item.id)}>
                    <button type="submit" className={cn(employeeListRowLinkClass, 'w-full text-start')}>
                      {body}
                      <span className="sr-only">{t('notifications.markRead')}</span>
                    </button>
                  </form>
                ) : (
                  <div className="px-4 py-3">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {page.nextCursor ? (
        <Link
          href={{ pathname: '/contractor/notifications', query: { cursor: page.nextCursor } }}
          className="self-center text-sm font-medium text-[var(--pf-primary)] hover:underline"
        >
          {t('notifications.loadOlder')}
        </Link>
      ) : null}
    </div>
  );
}
