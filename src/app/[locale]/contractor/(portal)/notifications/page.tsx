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
import { SubmitButton } from '@/components/ui/submit-button';
import { PortalPendingSubmitButton } from '@/modules/contractor-portal/ui/portal-pending-submit-button';
import {
  portalLinkQuietClass,
  portalListPanelClass,
  portalListRowLinkClass,
  portalPageHeaderClass,
  portalPageStackClass,
  portalPageSubtitleClass,
  portalPageTitleClass,
} from '@/modules/contractor-portal/ui/portal-surface';
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
    <div className={portalPageStackClass}>
      <header className={cn(portalPageHeaderClass, 'flex items-start justify-between gap-3')}>
        <div className="min-w-0 space-y-1.5">
          <h1 className={portalPageTitleClass}>{t('notifications.title')}</h1>
          <p className={portalPageSubtitleClass}>
            {page.unreadCount > 0
              ? t('notifications.unreadSummary', { count: page.unreadCount })
              : t('notifications.subtitle')}
          </p>
        </div>
        {page.unreadCount > 0 ? (
          <form action={markAllPortalNotificationsReadAction}>
            <PortalPendingSubmitButton>{t('notifications.markAllRead')}</PortalPendingSubmitButton>
          </form>
        ) : null}
      </header>

      {page.items.length === 0 ? (
        <EmptyState icon={Bell} title={t('notifications.empty.title')} description={t('notifications.empty.description')} />
      ) : (
        <ul className={portalListPanelClass}>
          {page.items.map((item) => {
            const unread = item.readAt === null;
            const href = isLivePortalHref(item.href) ? item.href : null;
            const body = (
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 space-y-0.5">
                  <p className={cn('text-sm', unread ? 'font-semibold text-[var(--pf-text-primary)]' : 'font-medium')}>
                    {item.title}
                  </p>
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
              <li key={item.id} className={cn(unread && 'bg-[var(--pf-teal-50)]/50')}>
                {href ? (
                  <Link href={href} className={portalListRowLinkClass}>
                    {body}
                  </Link>
                ) : unread ? (
                  <form action={markPortalNotificationReadAction.bind(null, item.id)}>
                    <SubmitButton
                      variant="ghost"
                      className={cn(portalListRowLinkClass, 'h-auto w-full justify-start text-start font-normal')}
                    >
                      {body}
                      <span className="sr-only">{t('notifications.markRead')}</span>
                    </SubmitButton>
                  </form>
                ) : (
                  <div className="px-4 py-3.5">{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {page.nextCursor ? (
        <Link
          href={{ pathname: '/contractor/notifications', query: { cursor: page.nextCursor } }}
          className={cn(portalLinkQuietClass, 'self-center')}
        >
          {t('notifications.loadOlder')}
        </Link>
      ) : null}
    </div>
  );
}
