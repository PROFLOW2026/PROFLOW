import { MainAppListToolbar, MainAppPage } from '@/components/patterns/main-app';
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
import { mainAppFilterToolbarClass } from '@/shared/ui/main-app-surface-styles';
import { FinancialYearBookExportGate } from './financial-year-book-export-gate';
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
  const [t, tCommon, params] = await Promise.all([
    getTranslations('dashboard.reports'),
    getTranslations('common'),
    searchParams,
  ]);
  const workKindFilter = parseWorkKindFilter(params.workKind);
  const section = parseReportsSection(params.section);
  const loadAnalytics = section != null;
  const fromDate = params.from || undefined;
  const toDate = params.to || undefined;

  const packs = await withOrgContext((context) => loadReportPackCatalog(context));

  return (
    <MainAppPage data-pf-reports-hub="" data-pf-reports-page="" className="w-full min-w-0 max-w-full">
      <PageHeader
        title={t('title')}
        actions={
          <div className="flex min-w-0 flex-wrap items-center justify-end gap-2">
            <FinancialYearBookExportGate />
            <ReportsExportActionsLazy />
          </div>
        }
      />

      <div
        className={`${mainAppFilterToolbarClass} flex min-w-0 w-full flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-center lg:gap-4`}
      >
        <div className="min-w-0 w-full shrink-0 lg:w-auto">
          <WorkKindFilterChrome active={workKindFilter} pathname="/reports" section={section} />
        </div>
        {loadAnalytics ? (
          <form method="get" className="min-w-0 w-full flex-1 basis-full lg:min-w-[20rem]">
            {params.workKind ? <input type="hidden" name="workKind" value={params.workKind} /> : null}
            {params.section ? <input type="hidden" name="section" value={params.section} /> : null}
            <MainAppListToolbar className="sm:items-end">
              <div className="min-w-0 flex-1">
                <DateRangeSelector
                  fromName="from"
                  toName="to"
                  defaultFrom={fromDate}
                  defaultTo={toDate}
                />
              </div>
              <button
                type="submit"
                className="h-9 shrink-0 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
              >
                {tCommon('actions.filter')}
              </button>
            </MainAppListToolbar>
          </form>
        ) : null}
      </div>

      <div data-pf-reports-body="" className="flex min-w-0 w-full flex-col gap-4">
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

        {section ? <ReportsSectionFocus section={section} /> : null}

        {loadAnalytics ? (
          <Suspense
            fallback={
              <p className="text-sm text-[var(--pf-text-secondary)]">{t('loadingAnalytics')}</p>
            }
          >
            <ReportsAnalyticsLoader
              workKindFilter={workKindFilter}
              section={section}
              fromDate={fromDate}
              toDate={toDate}
            />
          </Suspense>
        ) : (
          <ReportsAdvancedAnalysisGate workKindFilter={workKindFilter} />
        )}
      </div>
    </MainAppPage>
  );
}
