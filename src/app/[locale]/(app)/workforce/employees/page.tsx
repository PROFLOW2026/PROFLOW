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
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { Link } from '@/shared/i18n/navigation';

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

  const { employees, canManage, showCosts } = await withOrgContext(async (context) => {
    try {
      const rows = await listEmployeesForOrg(context);
      return {
        employees: rows,
        canManage: canManageWorkforce(context),
        showCosts: canViewWorkforceCosts(context),
      };
    } catch (error) {
      if (error instanceof AuthorizationError) throw error;
      throw error;
    }
  });

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
      <EmployeesTable employees={employees} canManage={canManage} showCosts={showCosts} />
    </div>
  );
}
