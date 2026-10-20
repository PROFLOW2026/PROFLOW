import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getRecognizedCostBreakdown } from '@/modules/financials/application/get-recognized-cost-breakdown';
import { RecognizedCostBreakdownView } from '@/modules/financials/ui/recognized-cost-breakdown-view';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'financial.overview.recognizedBreakdown' });
  return { title: t('pageTitle') };
}

export default async function RecognizedCostBreakdownPage({
  searchParams,
}: {
  searchParams: Promise<{ fromDate?: string; toDate?: string }>;
}) {
  const [t, search] = await Promise.all([
    getTranslations('financial.overview.recognizedBreakdown'),
    searchParams,
  ]);

  const result = await withOrgContext(async (context) => {
    const data = await getRecognizedCostBreakdown(context, {
      fromDate: search.fromDate,
      toDate: search.toDate,
    });
    if (!data) return { allowed: false as const, data: null, today: null };
    const today = todayInTimeZone(context.organization.timezone);
    return { allowed: true as const, data, today };
  });

  if (!result.allowed || !result.data || !result.today) {
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
        <RecognizedCostBreakdownView data={result.data} today={result.today} />
    
      </MainAppSection>
    </MainAppPage>
  );
}
