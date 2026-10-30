import {
  MainAppListBody,
  MainAppPage,
  MainAppSection,
  MainAppTableShell,
} from '@/components/patterns/main-app';
﻿import type { Metadata } from 'next';
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
  ExcessHoursApprovalPanel,
  ReturnTimesheetForm,
} from '@/modules/workforce/ui/timesheet-actions';
import { TimesheetApprovalFilters } from '@/modules/workforce/ui/timesheet-approval-filters';
import { withOrgContext } from '@/shared/auth/session';
import { assertCanAccessTimeApprovalQueue } from '@/modules/workforce/application/scoped-operational-approval';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import { canDecideTimeEntryApproval } from '@/modules/workforce/domain/manager-recorded-time';
import { businessDate, todayInTimeZone } from '@/shared/dates/dates';
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

  const queueStatus =
    !raw.status || raw.status === 'pending' ? undefined : raw.status;
  const parsed = timesheetFiltersSchema.safeParse({
    employeeId: raw.employeeId || undefined,
    fromDate: raw.fromDate || undefined,
    toDate: raw.toDate || undefined,
    status: queueStatus,
  });
  const filters = parsed.success ? parsed.data : {};

  const data = await withOrgContext(async (context) => {
    await assertCanAccessTimeApprovalQueue(context);
    const queue = await listTimeApprovalQueue(context, filters);
    const employees = await listEmployeesForOrg(context, { status: 'active' });
    return { ...queue, employees, today: todayInTimeZone(context.organization.timezone) };
  });

  const employeeUserIdById = new Map(data.employees.map((employee) => [employee.id, employee.userId]));
  const entryApprovableNow = (entry: (typeof data.entries)[number]) =>
    canDecideTimeEntryApproval({
      approvalStatus: entry.approvalStatus,
      createdByUserId: entry.createdByUserId,
      employeeUserId: employeeUserIdById.get(entry.employeeId) ?? null,
    });
  const approvableEntryIds = data.entries.filter(entryApprovableNow).map((entry) => entry.id);

  return (
    <MainAppPage>
      <PageHeader title={t('time.approvals.title')} description={t('time.approvals.queueHint')} />
      <MainAppSection>
        <WorkforceSubNav active="approvals" />
      <MainAppListBody>

      <TimesheetApprovalFilters
        employees={data.employees.map((employee) => ({ id: employee.id, name: employee.name }))}
        today={data.today}
        initial={{
          employeeId: filters.employeeId,
          fromDate: filters.fromDate,
          toDate: filters.toDate,
          status: raw.status && raw.status !== 'pending' ? raw.status : 'pending',
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
          {approvableEntryIds.length > 0 ? (
            <BulkApproveEntriesForm entryIds={approvableEntryIds} />
          ) : null}

          {data.timesheets.map((sheet) => (
            <Card key={sheet.id} className="flex flex-col gap-4 p-4 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 text-start">
                  <p className="font-medium">{sheet.employeeName}</p>
                  <p className="text-sm text-[var(--pf-text-secondary)]" dir="ltr">
                    {formatBusinessDate(businessDate(sheet.periodStart), locale, 'short')}
                    {' - '}
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
              <MainAppTableShell>
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
                        <TableCell numeric>{formatWorkHoursValue(entry.hours)}</TableCell>
                        <TableCell>
                          <div className="flex flex-col gap-2">
                            {entryApprovableNow(entry) ? (
                              <ApproveTimesheetButton timeEntryId={entry.id} />
                            ) : null}
                            <ExcessHoursApprovalPanel
                              entryId={entry.id}
                              excessHours={entry.excessHours}
                              excessApprovalStatus={entry.excessApprovalStatus}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </MainAppTableShell>
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
                    {formatWorkHoursValue(entry.hours)} {t('time.hoursAbbrev')}
                  </span>
                </div>
                <div className="mt-2">
                  <StatusBadge
                    shape={entry.approvalStatus === 'submitted' ? 'pending' : 'onHold'}
                    label={t(`time.approvalStatus.${entry.approvalStatus}`)}
                  />
                </div>
                {entryApprovableNow(entry) ? (
                  <div className="mt-3">
                    <ApproveTimesheetButton timeEntryId={entry.id} />
                  </div>
                ) : null}
                <div className="mt-3">
                  <ExcessHoursApprovalPanel
                    entryId={entry.id}
                    excessHours={entry.excessHours}
                    excessApprovalStatus={entry.excessApprovalStatus}
                  />
                </div>
              </div>
            )}
          />
        </div>
      )}
      </MainAppListBody>
      </MainAppSection>
    </MainAppPage>
  );
}
