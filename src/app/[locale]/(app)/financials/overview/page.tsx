import { MainAppListBody, MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { buildFinancialOverviewPrintPayload } from '@/modules/financials/application/build-financial-print-reports';
import { buildFinancialOverviewDetailedPrintPayload } from '@/modules/financials/application/build-financial-overview-detailed-print-payload';
import { getFinancialsOverview } from '@/modules/financials/application/get-financials-overview';
import { loadFinancialOverviewDetailedReportData } from '@/modules/financials/application/load-financial-overview-detailed-report-data';
import { FinancialsOverviewView } from '@/modules/financials/ui/financials-overview-view';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'financial' });
  return { title: t('overview.pageTitle') };
}

export default async function FinancialsOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ fromDate?: string; toDate?: string }>;
}) {
  const [{ locale }, t, search] = await Promise.all([
    params,
    getTranslations('financial.overview'),
    searchParams,
  ]);

  const result = await withOrgContext(async (context) => {
    const allowed =
      hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ) ||
      hasPermission(context, PERMISSIONS.BILLING_READ) ||
      hasPermission(context, PERMISSIONS.AP_READ);
    if (!allowed) {
      return {
        allowed: false as const,
        data: null,
        shortPrintPayload: null,
        detailedPrintPayload: null,
      };
    }
    const data = await getFinancialsOverview(context, {
      fromDate: search.fromDate,
      toDate: search.toDate,
    });
    const detailedData = await loadFinancialOverviewDetailedReportData(context, {
      fromDate: search.fromDate,
      toDate: search.toDate,
    });
    const [shortPrintPayload, detailedPrintPayload] = await Promise.all([
      buildFinancialOverviewPrintPayload(locale, context.organization.name, data),
      buildFinancialOverviewDetailedPrintPayload(
        locale,
        context.organization.name,
        data,
        detailedData,
      ),
    ]);
    return { allowed: true as const, data, shortPrintPayload, detailedPrintPayload };
  });

  if (!result.allowed || !result.data) {
    return (
      <MainAppPage>
        <PageHeader title={t('pageTitle')} description={t('pageHint')} />
      <MainAppSection>
        <EmptyState title={t('noAccessTitle')} description={t('noAccessBody')} />
      
      </MainAppSection>
    </MainAppPage>
    );
  }

  return (
    <MainAppPage>
      <PageHeader title={t('pageTitle')} description={t('pageHint')} />
      <MainAppSection>
        <MainAppListBody>
        <FinancialsOverviewView
          data={result.data}
          shortPrintPayload={result.shortPrintPayload}
          detailedPrintPayload={result.detailedPrintPayload}
        />
        </MainAppListBody>
      </MainAppSection>
    </MainAppPage>
  );
}
