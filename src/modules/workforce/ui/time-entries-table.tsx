import { getLocale, getTranslations } from 'next-intl/server';
import { Clock } from 'lucide-react';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { MoneyText } from '@/components/patterns/money-text';
import type { TimeApprovalStatus, TimeEntryListItem } from '@/modules/workforce';
import { businessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { fromNumericString } from '@/shared/money';
import { Link } from '@/shared/i18n/navigation';
import { SubmitTimeEntryButton, EditDraftTimeEntryForm, DeleteDraftTimeEntryButton } from './timesheet-actions';

interface TimeEntriesTableProps {
  readonly entries: readonly TimeEntryListItem[];
  readonly showCosts: boolean;
  readonly canLogTime: boolean;
}

function approvalShape(status: TimeApprovalStatus): StatusShape {
  if (status === 'approved') return 'approved';
  if (status === 'submitted') return 'pending';
  if (status === 'returned') return 'onHold';
  return 'draft';
}

function entryTarget(
  entry: TimeEntryListItem,
  t: Awaited<ReturnType<typeof getTranslations>>,
): string {
  const primary =
    entry.kind === 'project'
      ? entry.projectName ?? t('time.unknownProject')
      : entry.timeCodeName ?? t('time.nonProject');
  return entry.workPackageName ? `${primary} · ${entry.workPackageName}` : primary;
}

export async function TimeEntriesTable({ entries, showCosts, canLogTime }: TimeEntriesTableProps) {
  const t = await getTranslations('workforce');
  const locale = await getLocale();

  if (entries.length === 0) {
    return (
      <EmptyState
        icon={Clock}
        title={t('time.empty.title')}
        description={t('time.empty.description')}
        action={
          canLogTime ? (
            <Button asChild>
              <Link href="/workforce/time/new">{t('time.empty.action')}</Link>
            </Button>
          ) : undefined
        }
      />
    );
  }

  return (
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
              {entries.map((entry) => (
                <TableRow
                  key={entry.id}
                  className={entry.status === 'void' ? 'opacity-60' : undefined}
                >
                  <TableCell>
                    <span dir="ltr">{formatBusinessDate(businessDate(entry.workDate), locale, 'short')}</span>
                  </TableCell>
                  <TableCell>{entry.employeeName}</TableCell>
                  <TableCell>
                    {entry.kind === 'project'
                      ? entry.projectName ?? t('time.unknownProject')
                      : entry.timeCodeName ?? t('time.nonProject')}
                    {entry.workPackageName ? (
                      <p className="text-xs text-[var(--pf-text-muted)]">{entry.workPackageName}</p>
                    ) : null}
                  </TableCell>
                  <TableCell>
                    {entry.status === 'void' ? t('time.status.void') : t('time.status.recorded')}
                    {entry.status === 'recorded' ? (
                      <p className="mt-1">
                        <StatusBadge
                          shape={approvalShape(entry.approvalStatus)}
                          label={t(`time.approvalStatus.${entry.approvalStatus}`)}
                        />
                      </p>
                    ) : null}
                    {entry.correctsEntryId ? (
                      <p className="text-xs text-[var(--pf-text-muted)]">{t('time.status.correction')}</p>
                    ) : null}
                    {entry.excessHours && Number(entry.excessHours) > 0 ? (
                      <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">
                        {t('time.excess.pending', { hours: entry.excessHours })}
                      </p>
                    ) : null}
                    {entry.approvalStatus === 'returned' && entry.managerNote ? (
                      <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{entry.managerNote}</p>
                    ) : null}
                  </TableCell>
                  <TableCell numeric>{entry.hours}</TableCell>
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
          <p className="mt-2 text-start text-sm text-[var(--pf-text-secondary)]">{entryTarget(entry, t)}</p>
          <p className="mt-1 text-xs text-[var(--pf-text-muted)]">
            {entry.status === 'void' ? t('time.status.void') : t('time.status.recorded')}
          </p>
          {entry.status === 'recorded' ? (
            <div className="mt-1">
              <StatusBadge
                shape={approvalShape(entry.approvalStatus)}
                label={t(`time.approvalStatus.${entry.approvalStatus}`)}
              />
            </div>
          ) : null}
          {entry.approvalStatus === 'returned' && entry.managerNote ? (
            <p className="mt-1 text-start text-xs text-[var(--pf-text-secondary)]">{entry.managerNote}</p>
          ) : null}
          {showCosts && entry.costAmount && entry.costCurrency ? (
            <p className="mt-1 text-start text-sm">
              <MoneyText
                value={
                  fromNumericString(entry.costAmount, entry.costCurrency) ?? {
                    amount: entry.costAmount,
                    currency: entry.costCurrency,
                  }
                }
              />
            </p>
          ) : null}
          {canLogTime && entry.status === 'recorded' ? (
            <div className="mt-3 flex flex-col items-start gap-2">
              {entry.approvalStatus === 'approved' ? (
                <Button asChild variant="secondary" size="sm">
                  <Link href={`/workforce/time/new?correctsEntryId=${entry.id}`}>{t('time.correct')}</Link>
                </Button>
              ) : null}
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
            </div>
          ) : null}
        </div>
      )}
    />
  );
}
