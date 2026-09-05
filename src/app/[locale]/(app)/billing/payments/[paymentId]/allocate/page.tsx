import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listBillingRecords } from '@/modules/billing';
import { getPaymentAllocationView } from '@/modules/billing/application/get-payment-allocation-view';
import { AllocatePaymentForm } from '@/modules/billing/ui/allocate-payment-form';
import { withOrgContext } from '@/shared/auth/session';
import { NotFoundError } from '@/shared/errors';
import { isPositiveMoney } from '@/shared/money';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
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
  const t = await getTranslations('billing');

  let payment;
  let records;
  try {
    const loaded = await withOrgContext(async (context) => {
      const [paymentView, billingRecords] = await Promise.all([
        getPaymentAllocationView(context, paymentId),
        listBillingRecords(context, { filter: 'all', limit: 500 }),
      ]);
      return { payment: paymentView, records: billingRecords };
    });
    payment = loaded.payment;
    records = loaded.records;
  } catch (error) {
    if (error instanceof NotFoundError) notFound();
    throw error;
  }

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('paymentForm.allocateTitle')}
        description={
          isPositiveMoney(payment.unallocatedAmount)
            ? t('paymentForm.allocateHint')
            : t('paymentForm.fullyAllocatedHint')
        }
      />
      {isPositiveMoney(payment.unallocatedAmount) ? (
        <AllocatePaymentForm payment={payment} billingRecords={records} />
      ) : (
        <div className="rounded-lg border border-[var(--pf-border-default)] p-4 text-sm">
          <p>
            {t('paymentForm.cashReceivedPreview')}: {payment.amount.amount}{' '}
            {payment.amount.currency}
          </p>
          <p className="mt-1">
            {t('paymentForm.allocatedPreview')}: {payment.appliedAmount.amount}{' '}
            {payment.appliedAmount.currency}
          </p>
          <p className="mt-1">{t('paymentForm.fullyAllocatedHint')}</p>
        </div>
      )}
    </div>
  );
}
