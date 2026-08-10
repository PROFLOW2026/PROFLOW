import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { listTimeEntriesForOrg } from '@/modules/workforce';
import { canLogTime, canViewWorkforceCosts } from '@/modules/workforce/ui/employees-table';
import { TimeEntriesTable } from '@/modules/workforce/ui/time-entries-table';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('time.title') };
}

export default async function TimeEntriesPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string; employeeId?: string }>;
}) {
  const [t, filters] = await Promise.all([
    getTranslations('workforce'),
    searchParams,
  ]);

  const { entries, showCosts, allowLog } = await withOrgContext(async (context) => ({
    entries: await listTimeEntriesForOrg(context, {
      projectId: filters.projectId,
      employeeId: filters.employeeId,
    }),
    showCosts: canViewWorkforceCosts(context),
    allowLog: canLogTime(context),
  }));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('time.title')}
        description={t('time.description')}
        actions={
          allowLog ? (
            <Button asChild>
              <Link href="/workforce/time/new">{t('time.new')}</Link>
            </Button>
          ) : undefined
        }
      />

      <Tabs defaultValue="time">
        <TabsList>
          <TabsTrigger value="employees" asChild>
            <Link href="/workforce/employees">{t('nav.employees')}</Link>
          </TabsTrigger>
          <TabsTrigger value="time" asChild>
            <Link href="/workforce/time">{t('nav.time')}</Link>
          </TabsTrigger>
        </TabsList>
        <TabsContent value="time" className="mt-4">
          <TimeEntriesTable entries={entries} showCosts={showCosts} canLogTime={allowLog} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
