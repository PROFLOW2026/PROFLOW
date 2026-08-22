import { getLocale, getTranslations } from 'next-intl/server';
import { Clock } from 'lucide-react';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge } from '@/components/ui/status-badge';
import { MoneyText } from '@/components/patterns/money-text';
import type { TimeEntryListItem } from '@/modules/workforce';
import type { TimeEntryDailySummary } from '@/modules/workforce/application/time-entry-daily-summaries';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import { coerceBusinessDate, type BusinessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { fromNumericString } from '@/shared/money';
import { Link } from '@/shared/i18n/navigation';
import {
  DeleteDraftTimeEntryButton,
  EditDraftTimeEntryForm,
  SubmitTimeEntryButton,
} from './timesheet-actions';
import {
  approvalShape,
  entryTargetLine,
  formatHoursWithUnit,
  resolveTimeEntryStatusLabel,
} from './time-entry-display';
import { TimeEntriesMobileList } from './time-entries-mobile-list';

interface TimeEntriesTableProps {
  readonly entries: readonly TimeEntryListItem[];
  readonly showCosts: boolean;
  readonly canLogTime: boolean;
  readonly dailySummaries?: ReadonlyMap<string, TimeEntryDailySummary>;
  readonly projectScoped?: boolean;
  readonly hideEmployeeName?: boolean;
  /** When the parent already exposes a primary create action (e.g. project panel header). */
  readonly suppressEmptyCreate?: boolean;
  readonly todayDate?: BusinessDate;
}

export async function TimeEntriesTable({
  entries,
  showCosts,
  canLogTime,
  dailySummaries = new Map(),
  projectScoped = false,
  hideEmployeeName = false,
  suppressEmptyCreate = false,
  todayDate,
}: TimeEntriesTableProps) {
  const t = await getTranslations('workforce');
  const locale = await getLocale();

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title={t('time.empty.title')}
        description={t('time.empty.description')}
        action={
          canLogTime && !suppressEmptyCreate ? (
            <Button asChild>
              <Link href="/workforce/time/new">{t('time.empty.action')}</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  const desktopTarget = (entry: TimeEntryListItem) =>
    entryTargetLine(entry, t, { projectScoped }) ??
    (entry.kind === 'project'
      ? entry.projectName ?? t('time.unknownProject')
      : entry.timeCodeName ?? t('time.nonProject'));

  return (
    <>
      <ResponsiveTable
        items={entries}
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
                  {showCosts ? <TableHead numeric>{t('time.columns.cost')}</TableHead> : null}
                  {canLogTime ? <TableHead>{t('time.columns.actions')}</TableHead> : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {entries.map((entry) => {
                  const status = resolveTimeEntryStatusLabel(entry, t);
                  return (
                    <TableRow
                      key={entry.id}
                      className={entry.status === 'void' ? 'opacity-60' : undefined}
                    >
                      <TableCell>
                        <span dir="ltr">
                          {formatBusinessDate(coerceBusinessDate(entry.workDate), locale, 'short')}
                        </span>
                      </TableCell>
                      <TableCell>{entry.employeeName}</TableCell>
                      <TableCell>
                        {desktopTarget(entry)}
                        {entry.workPackageName && !projectScoped && entry.kind === 'project' ? (
                          <p className="text-xs text-[var(--pf-text-muted)]">{entry.workPackageName}</p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {entry.status === 'recorded' ? (
                          <StatusBadge shape={status.shape === 'void' ? 'draft' : status.shape} label={status.primary} />
                        ) : (
                          <StatusBadge shape="draft" label={status.primary} />
                        )}
                        {entry.correctsEntryId ? (
                          <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
                            {t('time.status.correction')}
                          </p>
                        ) : null}
                        {entry.excessHours && Number(entry.excessHours) > 0 ? (
                          <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                            {t('time.excess.pending', {
                              hours: formatWorkHoursValue(entry.excessHours),
                            })}
                          </p>
                        ) : null}
                        {entry.approvalStatus === 'returned' && entry.managerNote ? (
                          <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                            {entry.managerNote}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell numeric>{formatWorkHoursValue(entry.hours)}</TableCell>
                      {showCosts ? (
                        <TableCell numeric>
                          {entry.costAmount && entry.costCurrency ? (
                            <MoneyText
                              value={
                                fromNumericString(entry.costAmount, entry.costCurrency) ?? {
                                  amount: entry.costAmount,
                                  currency: entry.costCurrency,
                                }
                              }
                            />
                          ) : (
                            <span className="text-[var(--pf-text-muted)]">{t('time.noCost')}</span>
                          )}
                        </TableCell>
                      ) : null}
                      {canLogTime ? (
                        <TableCell>
                          <div className="flex flex-col items-start gap-2">
                            {entry.status === 'recorded' && entry.approvalStatus === 'approved' ? (
                              <Button asChild variant="ghost" size="sm">
                                <Link href={`/workforce/time/new?correctsEntryId=${entry.id}`}>
                                  {t('time.correct')}
                                </Link>
                              </Button>
                            ) : null}
                            {entry.status === 'recorded' ? (
                              <>
                                <EditDraftTimeEntryForm
                                  entryId={entry.id}
                                  hours={entry.hours}
                                  approvalStatus={entry.approvalStatus}
                                />
                                <SubmitTimeEntryButton
                                  entryId={entry.id}
                                  employeeId={entry.employeeId}
                                  approvalStatus={entry.approvalStatus}
                                />
                                <DeleteDraftTimeEntryButton
                                  entryId={entry.id}
                                  approvalStatus={entry.approvalStatus}
                                />
                              </>
                            ) : null}
                          </div>
                        </TableCell>
                      ) : null}
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        }
        renderMobileCard={() => null}
        mobileListClassName="hidden"
      />
      <div className="lg:hidden">
        <TimeEntriesMobileList
          entries={entries}
          showCosts={showCosts}
          canLogTime={canLogTime}
          dailySummaries={dailySummaries}
          projectScoped={projectScoped}
          hideEmployeeName={hideEmployeeName}
          todayDate={todayDate}
        />
      </div>
    </>
  );
}

// Keep approvalShape exported for tests/other imports
export { approvalShape, formatHoursWithUnit };
