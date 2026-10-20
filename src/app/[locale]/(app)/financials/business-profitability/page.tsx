import type { Metadata } from 'next';
import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
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
        <BusinessProfitabilityView data={data} />
    
      </MainAppSection>
    </MainAppPage>
  );
}
