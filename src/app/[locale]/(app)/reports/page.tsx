import type { Metadata } from 'next';
import { Suspense } from 'react';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { parseReportsSection, parseWorkKindFilter } from '@/modules/financials';
import { ReportsSectionFocus } from '@/modules/financials/ui/reports-section-focus';
import { WorkKindFilterChrome } from '@/modules/financials/ui/work-kind-filter-chrome';
import { loadReportPackCatalog } from '@/modules/reports';
import { ReportPacksSection } from '@/modules/reports/ui';
import { withOrgContext } from '@/shared/auth/session';
import { ReportsExportActionsLazy } from './reports-export-actions-lazy';
import { ReportsAdvancedAnalysisGate } from './reports-advanced-analysis-gate';
import { ReportsAnalyticsLoader } from './reports-analytics-loader';

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
  searchParams: Promise<{ workKind?: string; section?: string; from?: string; to?: string }>;
}) {
  const [t, params] = await Promise.all([
    getTranslations('dashboard.reports'),
    searchParams,
  ]);
  const workKindFilter = parseWorkKindFilter(params.workKind);
  const section = parseReportsSection(params.section);
  const loadAnalytics = section != null;
  const fromDate = params.from || undefined;
  const toDate = params.to || undefined;

  const packs = await withOrgContext((context) => loadReportPackCatalog(context));

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={<ReportsExportActionsLazy />}
      />

      <ReportPacksSection
        projects={packs.projects}
        quotes={packs.quotes}
        clients={packs.clients}
        vendors={packs.vendors}
        organizationId={packs.organizationId}
        enabledKinds={packs.enabledKinds}
        recommendedKinds={packs.recommendedKinds}
        orderedKinds={packs.orderedKinds}
      />

      <WorkKindFilterChrome active={workKindFilter} pathname="/reports" section={section} />

      {/* Period filter for analytics section */}
      {loadAnalytics ? (
        <form method="get" className="flex flex-wrap items-center gap-2">
          {params.workKind && <input type="hidden" name="workKind" value={params.workKind} />}
          {params.section && <input type="hidden" name="section" value={params.section} />}
          <DateRangeSelector fromName="from" toName="to" defaultFrom={fromDate} defaultTo={toDate} />
        </form>
      ) : null}

      {section ? <ReportsSectionFocus section={section} /> : null}

      {loadAnalytics ? (
        <Suspense fallback={<p className="text-sm text-[var(--pf-text-secondary)]">{t('loadingAnalytics')}</p>}>
          <ReportsAnalyticsLoader workKindFilter={workKindFilter} section={section} fromDate={fromDate} toDate={toDate} />
        </Suspense>
      ) : (
        <ReportsAdvancedAnalysisGate workKindFilter={workKindFilter} />
      )}
    </div>
  );
}
