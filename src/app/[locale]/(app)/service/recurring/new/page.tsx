import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { listClientsForOrg } from '@/modules/clients';
import { RecurrenceCreateForm } from '@/modules/service/recurrence/ui/recurrence-create-form';
import { listEmployeesForOrg } from '@/modules/workforce';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { redirect } from '@/shared/i18n/navigation';
import { createRecurrenceDefinitionAction } from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'service' });
  return { title: t('recurring.create.title') };
}

export default async function NewRecurringPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('service.recurring');
  const shell = await getShellContext();

  if (!shell?.permissions.has(PERMISSIONS.SERVICE_MANAGE)) {
    redirect({ href: '/service/recurring', locale });
  }

  const baseCurrency = shell?.organization.baseCurrency ?? 'ILS';
  const defaultStartDate = shell
    ? todayInTimeZone(shell.organization.timezone)
    : todayInTimeZone('Asia/Jerusalem');

  let clients: { id: string; name: string }[] = [];
  let employees: { id: string; name: string }[] = [];

  try {
    const loaded = await withOrgContext(async (context) => {
      const clientRows = await listClientsForOrg(context, {});
      let employeeRows: { id: string; name: string }[] = [];
      try {
        if (context.permissions.has(PERMISSIONS.WORKFORCE_READ)) {
          const rows = await listEmployeesForOrg(context, { status: 'active' });
          employeeRows = rows.map((row) => ({ id: row.id, name: row.name }));
        }
      } catch {
        employeeRows = [];
      }
      return {
        clients: clientRows.map((client) => ({ id: client.id, name: client.name })),
        employees: employeeRows,
      };
    });
    clients = loaded.clients;
    employees = loaded.employees;
  } catch {
    clients = [];
    employees = [];
  }

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('create.title')} description={t('create.description')} />
      <RecurrenceCreateForm
        clients={clients}
        employees={employees}
        baseCurrency={baseCurrency}
        defaultStartDate={defaultStartDate}
        action={createRecurrenceDefinitionAction}
      />
    </div>
  );
}
