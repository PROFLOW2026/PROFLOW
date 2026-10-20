import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import { getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { redirect } from '@/shared/i18n/navigation';
import { withOrgContext } from '@/shared/auth/session';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { resolveWorkforceHubHref } from '@/modules/workforce/domain/workforce-hub-entry';

export default async function WorkforcePage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations('workforce.hubAccess');

  const href = await withOrgContext(async (context) =>
    resolveWorkforceHubHref(
      (key) => hasPermission(context, key),
      (keys) => hasAnyPermission(context, keys),
    ),
  );

  if (href) {
    redirect({ href, locale });
  }

  return (
    <MainAppPage>
      <PageHeader title={t('title')} description={t('description')} />
      <MainAppSection>
        <Alert tone="info">{t('noPermission')}</Alert>
    
      </MainAppSection>
    </MainAppPage>
  );
}
