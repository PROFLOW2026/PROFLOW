import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listEmployeesForOrg } from '@/modules/workforce';
import { EmployeesTable, canManageWorkforce } from '@/modules/workforce/ui/employees-table';
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

  const { employees, canManage } = await withOrgContext(async (context) => {
    try {
      const rows = await listEmployeesForOrg(context);
      return { employees: rows, canManage: canManageWorkforce(context) };
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

      <Tabs defaultValue="employees">
        <TabsList>
          <TabsTrigger value="employees" asChild>
            <Link href="/workforce/employees">{t('nav.employees')}</Link>
          </TabsTrigger>
          <TabsTrigger value="time" asChild>
            <Link href="/workforce/time">{t('nav.time')}</Link>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="employees" className="mt-4">
          <EmployeesTable employees={employees} canManage={canManage} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
