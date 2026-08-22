import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/ui/page-header';
import {
  buildTimeEntryDailySummaries,
  listEmployeesForOrg,
  listProjectsForTimeLog,
  listTimeEntriesForOrg,
  timeEntryFiltersSchema,
} from '@/modules/workforce';
import { planExactDuplicateDraftRemovals } from '@/modules/workforce/domain/duplicate-draft-cleanup';
import { canLogTime, canViewWorkforceCosts } from '@/modules/workforce/ui/employees-table';
import { canReadOrgWorkforce } from '@/modules/workforce/application/time-scope';
import { DuplicateDraftCleanupBanner } from '@/modules/workforce/ui/duplicate-draft-cleanup-banner';
import { TimeEntriesTable } from '@/modules/workforce/ui/time-entries-table';
import { TimeEntryListFilters } from '@/modules/workforce/ui/time-entry-list-filters';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import { withOrgContext } from '@/shared/auth/session';
import { Link } from '@/shared/i18n/navigation';
import { todayInTimeZone } from '@/shared/dates';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { ReportsEntryLink } from '@/modules/financials/ui/reports-entry-link';

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
  searchParams: Promise<{
    projectId?: string;
    employeeId?: string;
    fromDate?: string;
    toDate?: string;
    status?: string;
    kind?: string;
    approvalStatus?: string;
  }>;
}) {
  const [t, rawFilters] = await Promise.all([getTranslations('workforce'), searchParams]);

  const parsedFilters = timeEntryFiltersSchema.safeParse({
    employeeId: rawFilters.employeeId || undefined,
    projectId: rawFilters.projectId || undefined,
    fromDate: rawFilters.fromDate || undefined,
    toDate: rawFilters.toDate || undefined,
    status: rawFilters.status || undefined,
    kind: rawFilters.kind || undefined,
    approvalStatus: rawFilters.approvalStatus || undefined,
  });
  const filters = parsedFilters.success ? parsedFilters.data : {};

  const { entries, showCosts, allowLog, employees, projects, canReadReports, selfScoped, dailySummaries, todayDate, canManageTime } =
    await withOrgContext(async (context) => {
      const orgRoster = canReadOrgWorkforce(context);
      const entries = await listTimeEntriesForOrg(context, filters);
      return {
        entries,
        showCosts: canViewWorkforceCosts(context),
        allowLog: canLogTime(context),
        employees: orgRoster
          ? await listEmployeesForOrg(context, { status: 'active' })
          : [],
        projects: await listProjectsForTimeLog(context),
        canReadReports: hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ),
        selfScoped: !orgRoster,
        dailySummaries: await buildTimeEntryDailySummaries(context, entries),
        todayDate: todayInTimeZone(context.organization.timezone),
        canManageTime: hasPermission(context, PERMISSIONS.TIME_MANAGE),
      };
    });

  const duplicateExtraCount = canManageTime
    ? planExactDuplicateDraftRemovals(entries).reduce((sum, plan) => sum + plan.removeIds.length, 0)
    : 0;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={t('time.title')}
        description={selfScoped ? t('time.selfDescription') : t('time.description')}
        actions={
          <div className="flex max-w-full flex-wrap gap-2">
            {canReadReports ? (
              <ReportsEntryLink section="cost">{t('time.reportsEntry')}</ReportsEntryLink>
            ) : null}
            {allowLog ? (
              <Button asChild>
                <Link href="/workforce/time/new">{t('time.new')}</Link>
              </Button>
            ) : undefined}
          </div>
        }
      />

      <WorkforceSubNav active="time" />

      <div className="flex flex-col gap-4">
        <TimeEntryListFilters
          employees={employees.map((employee) => ({ id: employee.id, name: employee.name }))}
          projects={projects}
          hideEmployeeFilter={selfScoped}
          initial={{
            employeeId: filters.employeeId,
            projectId: filters.projectId,
            fromDate: filters.fromDate,
            toDate: filters.toDate,
            status: filters.status ?? 'recorded',
            kind: filters.kind ?? 'all',
            approvalStatus: filters.approvalStatus ?? 'all',
          }}
        />
        {canManageTime ? (
          <DuplicateDraftCleanupBanner
            duplicateExtraCount={duplicateExtraCount}
            employeeId={filters.employeeId}
            projectId={filters.projectId}
            fromDate={filters.fromDate}
            toDate={filters.toDate}
          />
        ) : null}
        <TimeEntriesTable
          entries={entries}
          showCosts={showCosts}
          canLogTime={allowLog}
          dailySummaries={dailySummaries}
          hideEmployeeName={Boolean(filters.employeeId) || selfScoped}
          todayDate={todayDate}
        />
      </div>
    </div>
  );
}
