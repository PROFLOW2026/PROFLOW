import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { listEmployeesForOrg } from '@/modules/workforce';
import {
  EmployeesTable,
  canManageWorkforce,
  canViewWorkforceCosts,
} from '@/modules/workforce/ui/employees-table';
import { OrgWorkFrameworkForm } from '@/modules/workforce/ui/org-work-framework-form';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('title') };
}

export default async function EmployeesPage() {
  const t = await getTranslations('workforce');

  const { employees, canManage, showCosts, laborDefaults, canManageFramework, canBootstrapCosting } =
    await withOrgContext(async (context) => {
      try {
        const canManageFramework =
          hasPermission(context, PERMISSIONS.WORKFORCE_MANAGE) ||
          hasPermission(context, PERMISSIONS.WORKFORCE_COST_MANAGE) ||
          hasPermission(context, PERMISSIONS.SETTINGS_MANAGE);
        const laborDefaults = canManageFramework
          ? await import('@/modules/tenancy').then((m) =>
              m.getLaborCostDefaultsForApply(context).catch(() => null),
            )
          : null;
        const rows = await listEmployeesForOrg(context);
        return {
          employees: rows,
          canManage: canManageWorkforce(context),
          showCosts: canViewWorkforceCosts(context),
          laborDefaults,
          canManageFramework,
          canBootstrapCosting: hasPermission(context, PERMISSIONS.WORKFORCE_COST_MANAGE),
        };
      } catch (error) {
        if (error instanceof AuthorizationError) throw error;
        throw error;
      }
    });

  const orgFrameworkConfigured = Boolean(laborDefaults?.standardHoursPerDay);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('title')}
        description={t('description')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/workforce/employees/new">{t('employees.new')}</Link>
            </Button>
          ) : undefined
        }
      />

      <WorkforceSubNav active="employees" />

      {canManageFramework ? (
        <OrgWorkFrameworkForm
          standardHoursPerDay={laborDefaults?.standardHoursPerDay ?? null}
          workingDaysPerMonth={laborDefaults?.workingDaysPerMonth ?? null}
          workWeekdays={laborDefaults?.workWeekdays ?? null}
          setupRequired={!orgFrameworkConfigured}
          canBootstrapCosting={canBootstrapCosting}
        />
      ) : null}

      <EmployeesTable employees={employees} canManage={canManage} showCosts={showCosts} />
    </div>
  );
}
