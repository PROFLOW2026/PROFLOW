import type { Metadata } from 'next';
import { ClipboardCheck } from 'lucide-react';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  listEmployeesForOrg,
  listTimeApprovalQueue,
  timesheetFiltersSchema,
} from '@/modules/workforce';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import {
  ApproveTimesheetButton,
  BulkApproveEntriesForm,
  ReturnTimesheetForm,
} from '@/modules/workforce/ui/timesheet-actions';
import { TimesheetApprovalFilters } from '@/modules/workforce/ui/timesheet-approval-filters';
import { withOrgContext } from '@/shared/auth/session';
import { AuthorizationError } from '@/shared/errors';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { businessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('time.approvals.title') };
}

export default async function TimesheetApprovalsPage({
  searchParams,
}: {
  searchParams: Promise<{
    employeeId?: string;
    fromDate?: string;
    toDate?: string;
    status?: string;
  }>;
}) {
  const [t, locale, raw] = await Promise.all([
    getTranslations('workforce'),
    getLocale(),
    searchParams,
  ]);

  const parsed = timesheetFiltersSchema.safeParse({
    employeeId: raw.employeeId || undefined,
    fromDate: raw.fromDate || undefined,
    toDate: raw.toDate || undefined,
    status: raw.status || undefined,
  });
  const filters = parsed.success ? parsed.data : {};

  const data = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.TIME_APPROVE)) {
      throw new AuthorizationError(PERMISSIONS.TIME_APPROVE);
    }
    const queue = await listTimeApprovalQueue(context, {
      ...filters,
      status: filters.status ?? 'submitted',
    });
    const employees = await listEmployeesForOrg(context, { status: 'active' });
    return { ...queue, employees };
  });

  const submittedEntryIds = data.entries
    .filter((entry) => entry.approvalStatus === 'submitted')
    .map((entry) => entry.id);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={t('time.approvals.title')} description={t('time.approvals.description')} />
      <WorkforceSubNav active="approvals" />
      <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('time.approvals.queueHint')}</p>

      <TimesheetApprovalFilters
        employees={data.employees.map((employee) => ({ id: employee.id, name: employee.name }))}
        initial={{
          employeeId: filters.employeeId,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          status: filters.status ?? 'submitted',
        }}
      />

      {data.timesheets.length === 0 && data.entries.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={t('time.approvals.empty.title')}
          description={t('time.approvals.empty.description')}
        />
      ) : (
        <div className="flex flex-col gap-4">
          {submittedEntryIds.length > 0 ? (
            <BulkApproveEntriesForm entryIds={submittedEntryIds} />
          ) : null}

          {data.timesheets.map((sheet) => (
            <Card key={sheet.id} className="flex flex-col gap-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-start">
                  <p className="font-medium">{sheet.employeeName}</p>
                  <p className="text-sm text-[var(--pf-text-secondary)]" dir="ltr">
                    {formatBusinessDate(businessDate(sheet.periodStart), locale, 'short')}
                    {' – '}
                    {formatBusinessDate(businessDate(sheet.periodEnd), locale, 'short')}
                  </p>
                  <p className="mt-1 text-sm text-[var(--pf-text-muted)]">
                    {sheet.totalHours} {t('time.hoursAbbrev')} · {sheet.entryCount}
                  </p>
                </div>
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
              </div>
              {sheet.managerNote ? (
                <p className="text-start text-sm text-[var(--pf-text-secondary)]">{sheet.managerNote}</p>
              ) : null}
              {sheet.status === 'submitted' ? (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                  <ApproveTimesheetButton timesheetId={sheet.id} />
                  <ReturnTimesheetForm timesheetId={sheet.id} />
                </div>
              ) : null}
            </Card>
          ))}

          <ResponsiveTable
            items={data.entries}
            getRowKey={(entry) => entry.id}
            desktop={
              <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('time.columns.date')}</TableHead>
                      <TableHead>{t('time.columns.employee')}</TableHead>
                      <TableHead>{t('time.columns.target')}</TableHead>
                      <TableHead>{t('time.columns.status')}</TableHead>
                      <TableHead numeric>{t('time.columns.hours')}</TableHead>
                      <TableHead>{t('time.columns.actions')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {data.entries.map((entry) => (
                      <TableRow key={entry.id}>
                        <TableCell>
                          <span dir="ltr">
                            {formatBusinessDate(businessDate(entry.workDate), locale, 'short')}
                          </span>
                        </TableCell>
                        <TableCell>{entry.employeeName}</TableCell>
                        <TableCell>
                          {entry.kind === 'project'
                            ? entry.projectName ?? t('time.unknownProject')
                            : entry.timeCodeName ?? t('time.nonProject')}
                        </TableCell>
                        <TableCell>
                          <StatusBadge
                            shape={entry.approvalStatus === 'submitted' ? 'pending' : 'onHold'}
                            label={t(`time.approvalStatus.${entry.approvalStatus}`)}
                          />
                        </TableCell>
                        <TableCell numeric>{entry.hours}</TableCell>
                        <TableCell>
                          {entry.approvalStatus === 'submitted' ? (
                            <ApproveTimesheetButton timeEntryId={entry.id} />
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            }
            renderMobileCard={(entry) => (
              <div className="min-h-11 rounded-lg border border-[var(--pf-border-default)] p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1 text-start">
                    <p className="truncate font-medium">{entry.employeeName}</p>
                    <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                      {formatBusinessDate(businessDate(entry.workDate), locale, 'short')}
                    </p>
                  </div>
                  <span className="shrink-0 pf-numeric text-sm font-semibold">
                    {entry.hours} {t('time.hoursAbbrev')}
                  </span>
                </div>
                <div className="mt-2">
                  <StatusBadge
                    shape={entry.approvalStatus === 'submitted' ? 'pending' : 'onHold'}
                    label={t(`time.approvalStatus.${entry.approvalStatus}`)}
                  />
                </div>
                {entry.approvalStatus === 'submitted' ? (
                  <div className="mt-3">
                    <ApproveTimesheetButton timeEntryId={entry.id} />
                  </div>
                ) : null}
              </div>
            )}
          />
        </div>
      )}
    </div>
  );
}
