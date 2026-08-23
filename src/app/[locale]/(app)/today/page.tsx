import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getTodayInbox } from '@/modules/command-center';
import { TodayInboxPanel } from '@/modules/command-center/ui/today-inbox';
import { withOrgContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'commandCenter' });
  return { title: t('title') };
}

export default async function TodayPage() {
  const [t, tCommon] = await Promise.all([
    getTranslations('commandCenter'),
    getTranslations('common'),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <Suspense
        fallback={
          <p className="text-sm text-[var(--pf-text-secondary)]">{tCommon('states.loading')}</p>
        }
      >
        <TodayInboxBody />
      </Suspense>
    </div>
  );
}

async function TodayInboxBody() {
  const t = await getTranslations('commandCenter');
  const locale = await getLocale();

  const result = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.COMMAND_CENTER_READ)) {
      return { kind: 'forbidden' as const };
    }

    const inbox = await getTodayInbox(context);
    return { kind: 'ok' as const, inbox };
  });

  if (result.kind !== 'ok') {
    redirect({ href: '/', locale });
  }

  return (
    <>
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {t('summary', { count: result.inbox.totalActive })}
      </p>
      <TodayInboxPanel inbox={result.inbox} />
    </>
  );
}
