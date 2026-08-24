import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { EmployeeForm } from '@/modules/workforce/ui/employee-form';
import { listLinkableOrgMembers } from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { todayInTimeZone } from '@/shared/dates';
import { AuthorizationError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { createEmployeeAction } from '../actions';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('employees.new') };
}

export default async function NewEmployeePage() {
  const t = await getTranslations('workforce');

  const defaults = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.WORKFORCE_MANAGE)) {
      throw new AuthorizationError(PERMISSIONS.WORKFORCE_MANAGE);
    }
    const { getLaborCostDefaultsForApply } = await import('@/modules/tenancy');
    const laborDefaults = await getLaborCostDefaultsForApply(context).catch(() => null);
    return {
      currency: context.organization.baseCurrency,
      validFrom: todayInTimeZone(context.organization.timezone),
      linkableUsers: await listLinkableOrgMembers(context),
      workingDaysPerMonth: laborDefaults?.workingDaysPerMonth ?? null,
    };
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('employees.new')} description={t('employees.newDescription')} />
      <EmployeeForm
        action={createEmployeeAction}
        defaultCurrency={defaults.currency}
        defaultValidFrom={defaults.validFrom}
        linkableUsers={defaults.linkableUsers}
        defaultWorkingDaysPerMonth={defaults.workingDaysPerMonth}
      />
    </div>
  );
}
