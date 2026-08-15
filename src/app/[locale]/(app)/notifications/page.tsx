import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listNotifications } from '@/modules/notifications';
import { toNotificationInboxDto } from '@/modules/notifications/application/serialize';
import { NotificationInboxClient } from '@/modules/notifications/ui';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { redirect } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'notifications' });
  return { title: t('title') };
}

export default async function NotificationsPage() {
  const t = await getTranslations('notifications');
  const locale = await getLocale();

  const inbox = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)) return null;
    return toNotificationInboxDto(await listNotifications(context));
  });

  if (!inbox) {
    redirect({ href: '/', locale });
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('pageDescription')} />
      <NotificationInboxClient initialInbox={inbox} />
    </div>
  );
}
