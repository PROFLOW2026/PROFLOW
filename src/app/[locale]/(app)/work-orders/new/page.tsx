import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listClientsForOrg } from '@/modules/clients';
import { resolveApplicableDefaultTax } from '@/modules/tax';
import { listEmployeesForOrg } from '@/modules/workforce';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { formatMoney } from '@/shared/money/format';
import { zeroMoney } from '@/shared/money';
import { WorkOrderCreateForm } from './work-order-create-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'service' });
  return { title: t('create.title') };
}

export default async function NewWorkOrderPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('service');
  const shell = await getShellContext();
  const baseCurrency = shell?.organization.baseCurrency ?? 'ILS';
  const defaultRequestedDate = shell
    ? todayInTimeZone(shell.organization.timezone)
    : todayInTimeZone('Asia/Jerusalem');

  let clients: { id: string; name: string }[] = [];
  let employees: { id: string; name: string }[] = [];
  let taxRatePercent: string | null = null;

  try {
    const loaded = await withOrgContext(async (context) => {
      const [clientRows, employeeRows, tax] = await Promise.all([
        listClientsForOrg(context, {}),
        listEmployeesForOrg(context, { status: 'active' }).catch(() => []),
        resolveApplicableDefaultTax(
          context,
          todayInTimeZone(context.organization.timezone),
        ),
      ]);
      return {
        clients: clientRows.map((client) => ({ id: client.id, name: client.name })),
        employees: employeeRows.map((employee) => ({ id: employee.id, name: employee.name })),
        taxRatePercent: tax.resolved?.ratePercent ?? null,
      };
    });
    clients = loaded.clients;
    employees = loaded.employees;
    taxRatePercent = loaded.taxRatePercent;
  } catch {
    clients = [];
    employees = [];
  }

  const sample = formatMoney(zeroMoney(baseCurrency), locale);
  const currencySymbol = sample.replace(/[\d\s.,\u2212+-]/g, '').trim() || '₪';

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('create.title')} description={t('create.description')} />
      <WorkOrderCreateForm
        baseCurrency={baseCurrency}
        currencySymbol={currencySymbol}
        clients={clients}
        employees={employees}
        defaultRequestedDate={defaultRequestedDate}
        taxRatePercent={taxRatePercent}
      />
    </div>
  );
}
