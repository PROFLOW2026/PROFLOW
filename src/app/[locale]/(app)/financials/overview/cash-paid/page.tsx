import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
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
  searchParams,
}: {
  searchParams: Promise<{ fromDate?: string; toDate?: string }>;
}) {
  const [t, search] = await Promise.all([
    getTranslations('financial.overview.cashPaidBreakdown'),
    searchParams,
  ]);

  const result = await withOrgContext(async (context) => {
    const allowed =
      hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ) ||
      hasPermission(context, PERMISSIONS.AP_READ);
    if (!allowed) return { allowed: false as const, data: null, today: null };
    const data = await getCashPaidBreakdown(context, {
      fromDate: search.fromDate,
      toDate: search.toDate,
    });
    if (!data) return { allowed: false as const, data: null, today: null };
    const today = todayInTimeZone(context.organization.timezone);
    return { allowed: true as const, data, today };
  });

  if (!result.allowed || !result.data || !result.today) {
    return (
      <div className="flex min-w-0 flex-col gap-6">
        <PageHeader title={t('pageTitle')} description={t('pageHint')} />
        <EmptyState title={t('noAccessTitle')} description={t('noAccessBody')} />
      </div>
    );
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('pageTitle')} description={t('pageHint')} />
      <CashPaidBreakdownView data={result.data} today={result.today} />
    </div>
  );
}
