import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { BillingOrgAllocateView } from '@/modules/billing/ui/billing-org-allocate-view';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; paymentId: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  return { title: t('paymentForm.allocateTitle') };
}

export default async function AllocatePaymentPage({
  params,
}: {
  params: Promise<{ paymentId: string }>;
}) {
  const { paymentId } = await params;
  return (
    <BillingOrgAllocateView paymentId={paymentId} routeBase="/billing" surface="owner" />
  );
}
