import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getOrganizationReportsAnalytics } from '@/modules/financials';
import { ReportsAnalyticsView } from '@/modules/financials/ui';
import { withOrgContext } from '@/shared/auth/session';
import { ReportsExportActionsLazy } from './reports-export-actions-lazy';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'dashboard' });
  return { title: t('reports.title') };
}

export default async function ReportsPage() {
  const t = await getTranslations('dashboard.reports');

  const analytics = await withOrgContext(async (context) =>
    getOrganizationReportsAnalytics(context),
  );

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<ReportsExportActionsLazy />}
      />

      <ReportsAnalyticsView analytics={analytics} />
    </div>
  );
}
