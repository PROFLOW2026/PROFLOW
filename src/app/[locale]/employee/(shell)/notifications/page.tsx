import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { listMergedNotificationInbox } from '@/modules/notifications/application/actionable-inbox';
import { localizeNotificationInbox } from '@/modules/notifications/application/localize-notifications';
import { toNotificationInboxDto } from '@/modules/notifications/application/serialize';
import { NotificationInboxClient } from '@/modules/notifications/ui';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeePageStackClass } from '@/modules/employee-app/ui/employee-surface-styles';
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

export default async function EmployeeNotificationsPage() {
  const t = await getTranslations('notifications');
  const locale = await getLocale();

  const inbox = await withOrgContext(async (context) => {
    await assertEmployeeAppContext(context);
    if (!hasPermission(context, PERMISSIONS.NOTIFICATIONS_READ)) return null;
    const copy = await getTranslations('notifications');
    return toNotificationInboxDto(
      localizeNotificationInbox(await listMergedNotificationInbox(context), copy),
    );
  });

  if (!inbox) {
    redirect({ href: '/employee', locale });
  }

  return (
    <div className={employeePageStackClass}>
      <header className="space-y-1">
        <h1 className="text-xl font-bold">{t('title')}</h1>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('pageDescription')}</p>
      </header>
      <NotificationInboxClient initialInbox={inbox} />
    </div>
  );
}
