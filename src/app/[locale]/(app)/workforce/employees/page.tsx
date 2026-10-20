import { MainAppListBody, MainAppListSearchToolbar, MainAppPage, MainAppSection } from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { listEmployeesForOrg } from '@/modules/workforce';
import {
  EmployeesTable,
  canManageWorkforce,
  canViewWorkforceCosts,
} from '@/modules/workforce/ui/employees-table';
import { mapEmployeeAvatarKeys, resolveIdentityImageUrls } from '@/modules/identity-images';
import { OrgWorkFrameworkForm } from '@/modules/workforce/ui/org-work-framework-form';
import { EmployerCostOverview } from '@/modules/workforce/ui/employer-cost-overview';
import { getEmployerCostOverview } from '@/modules/workforce/application/get-employer-cost-overview';
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

export default async function EmployeesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const [t, tCommon, raw] = await Promise.all([
    getTranslations('workforce'),
    getTranslations('common'),
    searchParams,
  ]);
  const search = typeof raw.q === 'string' ? raw.q.trim() : '';

  const { employees, canManage, showCosts, laborDefaults, canManageFramework, canBootstrapCosting, employerCost } =
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
        const rows = await listEmployeesForOrg(context, search ? { search } : {});
        const avatarKeys = await mapEmployeeAvatarKeys(
          context.db,
          context.organizationId,
          rows.map((row) => row.id),
        );
        const avatarUrls = await resolveIdentityImageUrls(avatarKeys);
        const showCosts = canViewWorkforceCosts(context);
        return {
          employees: rows.map((row) => ({
            ...row,
            avatarUrl: avatarUrls.get(row.id) ?? null,
          })),
          canManage: canManageWorkforce(context),
          showCosts,
          laborDefaults,
          canManageFramework,
          canBootstrapCosting: hasPermission(context, PERMISSIONS.WORKFORCE_COST_MANAGE),
          employerCost: showCosts ? await getEmployerCostOverview(context) : null,
        };
      } catch (error) {
        if (error instanceof AuthorizationError) throw error;
        throw error;
      }
    });

  const orgFrameworkConfigured = Boolean(laborDefaults?.standardHoursPerDay);

  return (
    <MainAppPage>
      <PageHeader
        title={t('title')}
        actions={
          canManage ? (
            <Button asChild>
              <Link href="/workforce/employees/new">{t('employees.new')}</Link>
            </Button>
          ) : undefined
        }
      />
      <MainAppSection>
        <WorkforceSubNav active="employees" />

      {canManageFramework ? (
        <OrgWorkFrameworkForm
          standardHoursPerDay={laborDefaults?.standardHoursPerDay ?? null}
          workingDaysPerMonth={laborDefaults?.workingDaysPerMonth ?? null}
          standardWorkStartTime={laborDefaults?.standardWorkStartTime ?? null}
          standardWorkEndTime={laborDefaults?.standardWorkEndTime ?? null}
          workWeekdays={laborDefaults?.workWeekdays ?? null}
          attendanceProjectTimeApproval={
            laborDefaults?.attendanceProjectTimeApproval ?? 'draft'
          }
          setupRequired={!orgFrameworkConfigured}
          canBootstrapCosting={canBootstrapCosting}
        />
      ) : null}

      {employerCost ? <EmployerCostOverview data={employerCost} /> : null}

      <MainAppListBody>
      <MainAppListSearchToolbar
        initialQuery={search}
        searchPlaceholder={tCommon('actions.search')}
        compact
      />

      <EmployeesTable employees={employees} canManage={canManage} showCosts={showCosts} />
      </MainAppListBody>
      </MainAppSection>
    </MainAppPage>
  );
}
