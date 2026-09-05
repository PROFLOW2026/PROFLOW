import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listBillingRecords } from '@/modules/billing';
import { PaymentForm } from '@/modules/billing/ui/payment-form';
import { listClientsForOrg } from '@/modules/clients';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

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

  const { records, clients, defaultPaymentDate, defaultCurrency } = await withOrgContext(
    async (context) => {
      const [records, clients] = await Promise.all([
        listBillingRecords(context, { filter: 'all', limit: 200 }),
        hasPermission(context, PERMISSIONS.CLIENTS_READ)
          ? listClientsForOrg(context, { status: 'active', limit: 500 }).catch(() => [])
          : Promise.resolve([]),
      ]);

      const clientOptions =
        clients.length > 0
          ? clients.map((client) => ({ id: client.id, name: client.name }))
          : [
              ...new Map(
                records
                  .filter((record) => record.clientId)
                  .map((record) => [
                    record.clientId!,
                    {
                      id: record.clientId!,
                      name: record.projectName
                        ? `${record.projectName}`
                        : record.clientId!.slice(0, 8),
                    },
                  ]),
              ).values(),
            ];

      return {
        records,
        clients: clientOptions,
        defaultPaymentDate: todayInTimeZone(context.organization.timezone),
        defaultCurrency: context.organization.baseCurrency,
      };
    },
  );

  return (
    <div className="flex min-w-0 flex-col gap-6">
      <PageHeader
        title={t('paymentForm.title')}
        description={t('paymentForm.amountDescription')}
      />
      <PaymentForm
        billingRecords={records}
        clients={clients}
        defaultBillingRecordId={billingRecordId}
        defaultPaymentDate={defaultPaymentDate}
        defaultCurrency={defaultCurrency}
      />
    </div>
  );
}
