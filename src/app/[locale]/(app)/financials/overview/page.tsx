import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getFinancialsOverview } from '@/modules/financials/application/get-financials-overview';
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
  searchParams,
}: {
  searchParams: Promise<{ fromDate?: string; toDate?: string }>;
}) {
  const [t, search] = await Promise.all([
    getTranslations('financial.overview'),
    searchParams,
  ]);

  const result = await withOrgContext(async (context) => {
    const allowed =
      hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ) ||
      hasPermission(context, PERMISSIONS.BILLING_READ) ||
      hasPermission(context, PERMISSIONS.AP_READ);
    if (!allowed) {
      return { allowed: false as const, data: null };
    }
    const data = await getFinancialsOverview(context, {
      fromDate: search.fromDate,
      toDate: search.toDate,
    });
    return { allowed: true as const, data };
  });

  if (!result.allowed || !result.data) {
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
      <FinancialsOverviewView data={result.data} />
    </div>
  );
}
