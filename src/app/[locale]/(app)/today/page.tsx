import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getLocale, getTranslations } from 'next-intl/server';
import { Alert } from '@/components/ui/alert';
import { PageHeader } from '@/components/ui/page-header';
import { getTodayInbox } from '@/modules/command-center';
import { TodayDecisionsLensToggle } from '@/modules/command-center/ui/today-decisions-lens';
import { TodayInboxPanel } from '@/modules/command-center/ui/today-inbox';
import { isEmployeeAppUser } from '@/modules/employee-app/application/load-employee-app-context';
import { withOrgContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'commandCenter' });
  return { title: t('title') };
}

export default async function TodayPage({
  searchParams,
}: {
  searchParams: Promise<{ lens?: string }>;
}) {
  const [t, tCommon] = await Promise.all([
    getTranslations('commandCenter'),
    getTranslations('common'),
  ]);

  return (
    <MainAppPage>
      <PageHeader title={t('title')} description={t('description')} />
      <MainAppSection>
        <Suspense fallback={null}>
          <TodayDecisionsLensToggle />
        </Suspense>
        <Suspense
          fallback={
            <p className="text-sm text-[var(--pf-text-secondary)]">{tCommon('states.loading')}</p>
          }
        >
          <TodayInboxBodyWrapper searchParams={searchParams} />
        </Suspense>
      </MainAppSection>
    </MainAppPage>
  );
}

function TodayInboxBodyWrapper({
  searchParams,
}: {
  searchParams: Promise<{ lens?: string }>;
}) {
  return <TodayInboxBodyLoader searchParams={searchParams} />;
}

async function TodayInboxBodyLoader({
  searchParams,
}: {
  searchParams: Promise<{ lens?: string }>;
}) {
  const { lens } = await searchParams;
  const decisionsOnly = lens === 'decisions';
  return <TodayInboxBody decisionsOnly={decisionsOnly} />;
}

async function TodayInboxBody({ decisionsOnly = false }: { readonly decisionsOnly?: boolean }) {
  const t = await getTranslations('commandCenter');
  const locale = await getLocale();

  const result = await withOrgContext(async (context) => {
    if (isEmployeeAppUser(context)) {
      return { kind: 'employee' as const };
    }
    if (!hasPermission(context, PERMISSIONS.COMMAND_CENTER_READ)) {
      return { kind: 'forbidden' as const };
    }

    const inbox = await getTodayInbox(context);
    const defaultPaymentDate = todayInTimeZone(context.organization.timezone);
    return { kind: 'ok' as const, inbox, defaultPaymentDate };
  });

  if (result.kind === 'employee') {
    redirect({ href: '/employee', locale });
  }
  if (result.kind === 'forbidden') {
    return (
      <Alert tone="info">
        <p className="font-medium">{t('accessDeniedTitle')}</p>
        <p className="mt-1 text-sm">{t('accessDeniedDescription')}</p>
      </Alert>
    );
  }
  if (result.kind !== 'ok') {
    return (
      <Alert tone="info">
        <p className="font-medium">{t('accessDeniedTitle')}</p>
        <p className="mt-1 text-sm">{t('accessDeniedDescription')}</p>
      </Alert>
    );
  }

  const inbox = decisionsOnly
    ? {
        ...result.inbox,
        items: result.inbox.items.filter((item) => item.sourceType === 'project_decision_recent'),
        totalActive: result.inbox.items.filter((item) => item.sourceType === 'project_decision_recent')
          .length,
      }
    : result.inbox;

  return (
    <>
      <p className="text-sm text-[var(--pf-text-secondary)]">
        {decisionsOnly ? t('decisionsLens.summary', { count: inbox.totalActive }) : t('summary', { count: inbox.totalActive })}
      </p>
      <TodayInboxPanel inbox={inbox} defaultPaymentDate={result.defaultPaymentDate} />
    </>
  );
}
