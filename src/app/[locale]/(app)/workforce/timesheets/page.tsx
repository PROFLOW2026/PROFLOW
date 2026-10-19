import type { Metadata } from 'next';
import { ClipboardList } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { listEmployeesForOrg, listTimesheetsForOrg, timesheetFiltersSchema } from '@/modules/workforce';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { hasAnyPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { businessDate, todayInTimeZone } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { Link } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('timesheets.title') };
}

export default async function TimesheetsListPage({
  searchParams,
}: {
  searchParams: Promise<{ employeeId?: string; status?: string; fromDate?: string; toDate?: string }>;
}) {
  const [t, locale, raw] = await Promise.all([
    getTranslations('workforce'),
    getLocale(),
    searchParams,
  ]);
  const parsed = timesheetFiltersSchema.safeParse({
    employeeId: raw.employeeId || undefined,
    status: raw.status || undefined,
    fromDate: raw.fromDate || undefined,
    toDate: raw.toDate || undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const { sheets, today, employees } = await withOrgContext(async (context) => {
    if (
      !hasAnyPermission(context, [
        PERMISSIONS.WORKFORCE_READ,
        PERMISSIONS.TIME_MANAGE,
        PERMISSIONS.TIME_APPROVE,
      ])
    ) {
      throw new AuthorizationError(PERMISSIONS.WORKFORCE_READ);
    }
    const employees = hasPermission(context, PERMISSIONS.WORKFORCE_READ)
      ? await listEmployeesForOrg(context, { status: 'active' })
      : [];
    return {
      sheets: await listTimesheetsForOrg(context, { ...filters, status: filters.status ?? 'all' }),
      today: todayInTimeZone(context.organization.timezone),
      employees,
    };
  });

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('timesheets.title')} description={t('timesheets.description')} />
      <WorkforceSubNav active="timesheets" />
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('timesheets.notPayroll')}</p>
      <form method="get" className="flex flex-col gap-2">
        <div className="flex flex-wrap items-end gap-2">
          {employees.length > 0 ? (
            <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-[var(--pf-text-secondary)] sm:max-w-xs">
              {t('time.filters.employee')}
              <select
                name="employeeId"
                defaultValue={filters.employeeId ?? ''}
                className="h-9 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 text-sm"
              >
                <option value="">{t('time.filters.all')}</option>
                {employees.map((employee) => (
                  <option key={employee.id} value={employee.id}>
                    {employee.name}
                  </option>
                ))}
              </select>
            </label>
          ) : filters.employeeId ? (
            <input type="hidden" name="employeeId" value={filters.employeeId} />
          ) : null}
          <label className="flex min-w-[10rem] flex-1 flex-col gap-1 text-xs text-[var(--pf-text-secondary)] sm:max-w-xs">
            {t('timesheets.columns.status')}
            <select
              name="status"
              defaultValue={filters.status ?? 'all'}
              className="h-9 rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-2 text-sm"
            >
              <option value="all">{t('time.filters.all')}</option>
              <option value="pending">{t('time.approvals.filters.pending')}</option>
              <option value="draft">{t('time.approvalStatus.draft')}</option>
              <option value="submitted">{t('time.approvalStatus.submitted')}</option>
              <option value="approved">{t('time.approvalStatus.approved')}</option>
              <option value="returned">{t('time.approvalStatus.returned')}</option>
            </select>
          </label>
        </div>
        <p className="text-xs text-[var(--pf-text-muted)]">{t('timesheets.filters.workDateHint')}</p>
        <DateRangeSelector
          today={today}
          defaultFrom={filters.fromDate ?? ''}
          defaultTo={filters.toDate ?? ''}
          fromName="fromDate"
          toName="toDate"
        />
        <button
          type="submit"
          className="self-start h-9 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
        >
          {t('attendance.filters.apply')}
        </button>
      </form>

      {sheets.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={t('timesheets.empty.title')}
          description={t('timesheets.empty.description')}
        />
      ) : (
        <ResponsiveTable
          items={sheets}
          getRowKey={(sheet) => sheet.id}
          desktop={
            <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('timesheets.columns.employee')}</TableHead>
                    <TableHead>{t('timesheets.columns.period')}</TableHead>
                    <TableHead>{t('timesheets.columns.status')}</TableHead>
                    <TableHead numeric>{t('timesheets.columns.hours')}</TableHead>
                    <TableHead>{t('timesheets.columns.locked')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sheets.map((sheet) => (
                    <TableRow key={sheet.id}>
                      <TableCell>
                        <Link href={`/workforce/timesheets/${sheet.id}`} className="underline">
                          {sheet.employeeName}
                        </Link>
                      </TableCell>
                      <TableCell>
                        <span dir="ltr">
                          {formatBusinessDate(businessDate(sheet.periodStart), locale, 'short')}
                          {' – '}
                          {formatBusinessDate(businessDate(sheet.periodEnd), locale, 'short')}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge
                          shape={
                            sheet.status === 'approved'
                              ? 'approved'
                              : sheet.status === 'submitted'
                                ? 'pending'
                                : sheet.status === 'returned'
                                  ? 'onHold'
                                  : 'draft'
                          }
                          label={t(`time.approvalStatus.${sheet.status}`)}
                        />
                      </TableCell>
                      <TableCell numeric>{sheet.totalHours}</TableCell>
                      <TableCell>{sheet.lockedAt ? t('timesheets.lockedYes') : '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          }
          renderMobileCard={(sheet) => (
            <Link
              href={`/workforce/timesheets/${sheet.id}`}
              className="block min-h-11 rounded-lg border border-[var(--pf-border-default)] p-4"
            >
              <p className="font-medium">{sheet.employeeName}</p>
              <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                {formatBusinessDate(businessDate(sheet.periodStart), locale, 'short')}
                {' – '}
                {formatBusinessDate(businessDate(sheet.periodEnd), locale, 'short')}
              </p>
              <p className="mt-1 text-sm">
                {sheet.totalHours} {t('time.hoursAbbrev')} · {t(`time.approvalStatus.${sheet.status}`)}
              </p>
            </Link>
          )}
        />
      )}
    </div>
  );
}
