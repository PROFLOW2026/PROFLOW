import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getHomeDashboard } from '@/modules/financials';
import { HomeDashboardContent } from '@/modules/financials/ui';
import { PwaInstallCta } from '@/modules/offline/ui/pwa-install-cta';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { DashboardSkeleton } from './dashboard-skeleton';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return { title: t('title') };
}

/**
 * Home dashboard (`/`).
 *
 * Header streams immediately (shell context is request-cached from AppShell).
 * Heavy aggregates load behind Suspense so nav feels closer to sibling list
 * routes that already ship `loading.tsx`.
 */
export default async function DashboardPage() {
  const [t, tCommon, shell] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('common'),
    getShellContext(),
  ]);
  const name = shell?.user.displayName;

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={name ? t('greeting', { name }) : t('greetingNoName')} />
      <PwaInstallCta variant="dashboard" />
      <Suspense
        fallback={<DashboardSkeleton showTitle={false} label={tCommon('states.loading')} />}
      >
        <HomeDashboardSection />
      </Suspense>
    </div>
  );
}

async function HomeDashboardSection() {
  const data = await withOrgContext((context) => getHomeDashboard(context));
  return <HomeDashboardContent data={data} />;
}
