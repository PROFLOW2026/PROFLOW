import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listBillingRecords } from '@/modules/billing';
import { PaymentForm } from '@/modules/billing/ui/payment-form';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'billing' });
  return { title: t('paymentForm.title') };
}

export default async function NewPaymentPage({
  searchParams,
}: {
  searchParams: Promise<{ billingRecordId?: string }>;
}) {
  const { billingRecordId } = await searchParams;
  const t = await getTranslations('billing');

  const { records, defaultPaymentDate } = await withOrgContext(async (context) => ({
    records: await listBillingRecords(context, { filter: 'all', limit: 200 }),
    defaultPaymentDate: todayInTimeZone(context.organization.timezone),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('paymentForm.title')} description={t('paymentForm.partialAllowed')} />
      <PaymentForm
        billingRecords={records}
        defaultBillingRecordId={billingRecordId}
        defaultPaymentDate={defaultPaymentDate}
      />
    </div>
  );
}
