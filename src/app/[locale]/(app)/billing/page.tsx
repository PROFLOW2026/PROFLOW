import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BillingOrgHubView } from '@/modules/billing/ui/billing-org-hub-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  return { title: t('title') };
}

export default async function BillingListPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{
    filter?: string;
    contractId?: string;
    fromDate?: string;
    toDate?: string;
    paymentFrom?: string;
    paymentTo?: string;
    view?: string;
    page?: string;
  }>;
}) {
  const [{ locale }, search] = await Promise.all([params, searchParams]);
  return (
    <BillingOrgHubView
      routeBase="/billing"
      surface="owner"
      locale={locale}
      searchParams={search}
    />
  );
}
