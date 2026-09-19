import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { getBusinessProfitability } from '@/modules/financials/application/get-business-profitability';
import { BusinessProfitabilityView } from '@/modules/financials/ui/business-profitability-view';
import { withOrgContext } from '@/shared/auth/session';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'financial.businessProfitability' });
  return { title: t('pageTitle') };
}

export default async function BusinessProfitabilityPage() {
  const t = await getTranslations('financial.businessProfitability');

  const data = await withOrgContext((context) => getBusinessProfitability(context));

  if (!data) {
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
      <BusinessProfitabilityView data={data} />
    </div>
  );
}
