import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { listAvailableCreateWorkKinds } from '@/components/shell/quick-create-actions';
import { PageHeader } from '@/components/ui/page-header';
import { listClientsForOrg } from '@/modules/clients';
import { resolveApplicableDefaultTax } from '@/modules/tax';
import { listEmployeesForOrg } from '@/modules/workforce';
import { getShellContext, withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { formatMoney } from '@/shared/money/format';
import { zeroMoney } from '@/shared/money';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { WorkKindCreateHint } from '../../projects/new/work-kind-create-hint';
import { JobCreateForm } from './job-create-form';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'jobs' });
  return { title: t('create.title') };
}

export default async function NewJobPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations('jobs');
  const shell = await getShellContext();
  const baseCurrency = shell?.organization.baseCurrency ?? 'ILS';
  const defaultStartDate = shell
    ? todayInTimeZone(shell.organization.timezone)
    : todayInTimeZone('Asia/Jerusalem');

  const canAssignEmployees = shell?.permissions.has(PERMISSIONS.WORKFORCE_MANAGE) ?? false;

  let clients: { id: string; name: string }[] = [];
  let taxRatePercent: string | null = null;
  let employees: { id: string; name: string; jobTitle: string | null }[] = [];
  try {
    const loaded = await withOrgContext(async (context) => {
      const [rows, tax, employeeRows] = await Promise.all([
        listClientsForOrg(context, {}),
        resolveApplicableDefaultTax(
          context,
          todayInTimeZone(context.organization.timezone),
        ),
        canAssignEmployees
          ? listEmployeesForOrg(context, { status: 'active' }).catch(() => [])
          : Promise.resolve([]),
      ]);
      return {
        clients: rows.map((client) => ({ id: client.id, name: client.name })),
        taxRatePercent: tax.resolved?.ratePercent ?? null,
        employees: employeeRows.map((employee) => ({
          id: employee.id,
          name: employee.name,
          jobTitle: employee.jobTitle,
        })),
      };
    });
    clients = loaded.clients;
    taxRatePercent = loaded.taxRatePercent;
    employees = loaded.employees;
  } catch {
    clients = [];
  }

  const sample = formatMoney(zeroMoney(baseCurrency), locale);
  const currencySymbol = sample.replace(/[\d\s.,\u2212+-]/g, '').trim() || '₪';
  const workKindOptions = shell
    ? listAvailableCreateWorkKinds(
        shell.permissions,
        shell.modules,
        shell.workMix ?? 'projects',
        shell.suggestedDefaults,
      )
    : [];

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('create.title')} description={t('create.description')} />
      <WorkKindCreateHint
        current="job"
        defaultWorkKind={shell?.suggestedDefaults?.defaultWorkKind}
        options={workKindOptions}
        messagesNamespace="jobs"
      />
      <JobCreateForm
        baseCurrency={baseCurrency}
        currencySymbol={currencySymbol}
        clients={clients}
        defaultStartDate={defaultStartDate}
        taxRatePercent={taxRatePercent}
        employees={employees}
        canAssignEmployees={canAssignEmployees}
      />
    </div>
  );
}
