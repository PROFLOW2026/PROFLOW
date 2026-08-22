import type { Metadata } from 'next';
import { getLocale, getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { StatusBadge } from '@/components/ui/status-badge';
import { Card } from '@/components/ui/card';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  canApproveTime,
  getTimesheetDetail,
} from '@/modules/workforce';
import {
  ApproveTimesheetButton,
  ReturnTimesheetForm,
  SubmitTimesheetButton,
} from '@/modules/workforce/ui/timesheet-actions';
import { WorkforceSubNav } from '@/modules/workforce/ui/workforce-sub-nav';
import { withOrgContext } from '@/shared/auth/session';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import { businessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkMutedClassName } from '@/components/ui/pressable';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'workforce' });
  return { title: t('timesheets.detailTitle') };
}

export default async function TimesheetDetailPage({
  params,
}: {
  params: Promise<{ timesheetId: string }>;
}) {
  const { timesheetId } = await params;
  const [t, locale] = await Promise.all([getTranslations('workforce'), getLocale()]);

  const data = await withOrgContext(async (context) => {
    const detail = await getTimesheetDetail(context, timesheetId);
    return {
      ...detail,
      canApprove: canApproveTime(context),
      canSubmit: hasPermission(context, PERMISSIONS.TIME_MANAGE),
    };
  });

  const { timesheet: sheet, entries, totals } = data;

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={sheet.employeeName || t('timesheets.detailTitle')}
        description={t('timesheets.detailDescription')}
        breadcrumb={
          <Link href="/workforce/timesheets" className={textNavLinkMutedClassName}>
            {t('timesheets.title')}
          </Link>
        }
      />
      <WorkforceSubNav active="timesheets" />
      <p className="text-sm text-[var(--pf-text-secondary)]">{t('timesheets.notPayroll')}</p>

      <Card className="flex flex-col gap-3 p-4 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm text-[var(--pf-text-secondary)]" dir="ltr">
              {formatBusinessDate(businessDate(sheet.periodStart), locale, 'short')}
              {' – '}
              {formatBusinessDate(businessDate(sheet.periodEnd), locale, 'short')}
            </p>
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
            {sheet.lockedAt ? (
              <p className="mt-2 text-sm text-[var(--pf-text-muted)]">{t('timesheets.lockedHint')}</p>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            {data.canSubmit && (sheet.status === 'draft' || sheet.status === 'returned') ? (
              <SubmitTimesheetButton employeeId={sheet.employeeId} periodStart={sheet.periodStart} />
            ) : null}
            {data.canApprove && sheet.status === 'submitted' ? (
              <>
                <ApproveTimesheetButton timesheetId={sheet.id} />
                <ReturnTimesheetForm timesheetId={sheet.id} />
              </>
            ) : null}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-md bg-[var(--pf-bg-muted)] p-3">
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('timesheets.totals.project')}</p>
            <p className="font-semibold">{totals.projectHours.toFixed(2)}</p>
          </div>
          <div className="rounded-md bg-[var(--pf-bg-muted)] p-3">
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('timesheets.totals.nonProject')}</p>
            <p className="font-semibold">{totals.nonProjectHours.toFixed(2)}</p>
          </div>
          <div className="rounded-md bg-[var(--pf-bg-muted)] p-3">
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('timesheets.totals.missingDays')}</p>
            <p className="font-semibold">
              {totals.missingDays == null ? '—' : totals.missingDays}
            </p>
          </div>
        </div>
      </Card>

      <ResponsiveTable
        items={entries}
        getRowKey={(entry) => entry.id}
        desktop={
          <div className="overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('time.columns.date')}</TableHead>
                  <TableHead>{t('time.columns.target')}</TableHead>
                  <TableHead>{t('time.columns.status')}</TableHead>
                  <TableHead numeric>{t('time.columns.hours')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell>
                      <span dir="ltr">
                        {formatBusinessDate(businessDate(entry.workDate), locale, 'short')}
                      </span>
                    </TableCell>
                    <TableCell>
                      {entry.kind === 'project'
                        ? entry.projectName ?? t('time.unknownProject')
                        : entry.timeCodeName ?? t('time.nonProject')}
                    </TableCell>
                    <TableCell>
                      <StatusBadge
                        shape={
                          entry.approvalStatus === 'approved'
                            ? 'approved'
                            : entry.approvalStatus === 'submitted'
                              ? 'pending'
                              : entry.approvalStatus === 'returned'
                                ? 'onHold'
                                : 'draft'
                        }
                        label={t(`time.approvalStatus.${entry.approvalStatus}`)}
                      />
                    </TableCell>
                    <TableCell numeric>{formatWorkHoursValue(entry.hours)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        }
        renderMobileCard={(entry) => (
          <div className="rounded-lg border border-[var(--pf-border-default)] p-4">
            <p className="font-medium" dir="ltr">
              {formatBusinessDate(businessDate(entry.workDate), locale, 'short')}
            </p>
            <p className="text-sm text-[var(--pf-text-secondary)]">
              {entry.kind === 'project'
                ? entry.projectName ?? t('time.unknownProject')
                : entry.timeCodeName ?? t('time.nonProject')}
            </p>
            <p className="mt-1 text-sm">
              {formatWorkHoursValue(entry.hours)} {t('time.hoursAbbrev')}
            </p>
          </div>
        )}
      />
    </div>
  );
}
