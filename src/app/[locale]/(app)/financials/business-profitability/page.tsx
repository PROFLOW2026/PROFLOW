import type { Metadata } from 'next';
import { MainAppPage, MainAppSection } from '@/components/patterns/main-app';
import { getTranslations } from 'next-intl/server';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/ui/page-header';
import { buildBusinessProfitabilityPrintPayload } from '@/modules/financials/application/build-financial-print-reports';
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

export default async function BusinessProfitabilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, t, tFinancial] = await Promise.all([
    params,
    getTranslations('financial.businessProfitability'),
    getTranslations('financial'),
  ]);

  const loaded = await withOrgContext(async (context) => {
    const data = await getBusinessProfitability(context);
    if (!data) return null;
    const printPayload = await buildBusinessProfitabilityPrintPayload(
      locale,
      context.organization.name,
      data,
    );
    return { data, printPayload };
  });

  if (!loaded) {
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
            <p>{t('disclaimer')}</p>
            <p>{t('scopeNote')}</p>
            <p>{tFinancial('profitVsCash')}</p>
          </>
        }
      />
      <MainAppSection>
        <BusinessProfitabilityView data={loaded.data} printPayload={loaded.printPayload} />
    
      </MainAppSection>
    </MainAppPage>
  );
}
