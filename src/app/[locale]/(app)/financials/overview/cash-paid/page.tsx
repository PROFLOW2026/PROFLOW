import type { Metadata } from 'next';
import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { buildCashPaidBreakdownPrintPayload } from '@/modules/financials/application/build-financial-print-reports';
import { getCashPaidBreakdown } from '@/modules/financials/application/get-cash-paid-breakdown';
import { CashPaidBreakdownView } from '@/modules/financials/ui/cash-paid-breakdown-view';
import { withOrgContext } from '@/shared/auth/session';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { todayInTimeZone } from '@/shared/dates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'financial.overview.cashPaidBreakdown' });
  return { title: t('pageTitle') };
}

export default async function CashPaidBreakdownPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ fromDate?: string; toDate?: string }>;
}) {
  const [{ locale }, t, tOverview, search] = await Promise.all([
    params,
    getTranslations('financial.overview.cashPaidBreakdown'),
    getTranslations('financial.overview'),
    searchParams,
  ]);

  const result = await withOrgContext(async (context) => {
    const allowed =
      hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ) ||
      hasPermission(context, PERMISSIONS.AP_READ);
    if (!allowed) return { allowed: false as const, data: null, today: null, printPayload: null };
    const data = await getCashPaidBreakdown(context, {
      fromDate: search.fromDate,
      toDate: search.toDate,
    });
    if (!data) return { allowed: false as const, data: null, today: null, printPayload: null };
    const today = todayInTimeZone(context.organization.timezone);
    const printPayload = await buildCashPaidBreakdownPrintPayload(locale, context.organization.name, data);
    return { allowed: true as const, data, today, printPayload };
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
      <PageHeader
        title={t('pageTitle')}
        description={
          <>
            <p>{t('pageHint')}</p>
            <p>{t('scopeHint')}</p>
            <p>{tOverview('cashPaidHint')}</p>
          </>
        }
      />
      <MainAppSection>
        <CashPaidBreakdownView
          data={result.data}
          today={result.today}
          printPayload={result.printPayload}
        />
    
      </MainAppSection>
    </MainAppPage>
  );
}
