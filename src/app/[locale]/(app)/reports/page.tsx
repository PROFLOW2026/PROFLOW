import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { getOrganizationReportsAnalytics, parseWorkKindFilter } from '@/modules/financials';
import { ReportsAnalyticsView } from '@/modules/financials/ui';
import { WorkKindFilterChrome } from '@/modules/financials/ui/work-kind-filter-chrome';
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

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ workKind?: string }>;
}) {
  const [t, params] = await Promise.all([
    getTranslations('dashboard.reports'),
    searchParams,
  ]);
  const workKindFilter = parseWorkKindFilter(params.workKind);

  const analytics = await withOrgContext(async (context) =>
    getOrganizationReportsAnalytics(context, {
      workKindFilter,
    }),
  );

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<ReportsExportActionsLazy />}
      />

      <WorkKindFilterChrome active={workKindFilter} pathname="/reports" />

      <ReportsAnalyticsView analytics={analytics} />
    </div>
  );
}
