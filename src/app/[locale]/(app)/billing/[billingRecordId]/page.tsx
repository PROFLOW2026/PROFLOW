import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BillingOrgDetailView } from '@/modules/billing/ui/billing-org-detail-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; billingRecordId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  return { title: t('detail.title') };
}

export default async function BillingDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string; billingRecordId: string }>;
  searchParams: Promise<{ paymentRecorded?: string; paymentId?: string }>;
}) {
  const [{ locale, billingRecordId }, query] = await Promise.all([params, searchParams]);
  return (
    <BillingOrgDetailView
      billingRecordId={billingRecordId}
      routeBase="/billing"
      surface="owner"
      locale={locale}
      searchParams={query}
    />
  );
}
