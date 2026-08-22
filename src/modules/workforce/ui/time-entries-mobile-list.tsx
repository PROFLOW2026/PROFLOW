import { getLocale, getTranslations } from 'next-intl/server';
import { StatusBadge } from '@/components/ui/status-badge';
import { MoneyText } from '@/components/patterns/money-text';
import type { TimeEntryListItem } from '@/modules/workforce';
import type { TimeEntryDailySummary } from '@/modules/workforce/application/time-entry-daily-summaries';
import { coerceBusinessDate, type BusinessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { fromNumericString } from '@/shared/money';
import {
  dailySummaryKey,
  entryTargetLine,
  formatHoursWithUnit,
  groupTimeEntriesByDate,
  resolveTimeEntryStatusLabel,
} from './time-entry-display';
import { formatWorkHoursValue } from '@/modules/workforce/domain/format-work-hours';
import { TimeEntryMobileActions } from './time-entry-mobile-actions';

interface TimeEntriesMobileListProps {
  readonly entries: readonly TimeEntryListItem[];
  readonly showCosts: boolean;
  readonly canLogTime: boolean;
  readonly dailySummaries: ReadonlyMap<string, TimeEntryDailySummary>;
  /** When true, project name is omitted (page title already names the project). */
  readonly projectScoped?: boolean;
  /** Hide employee name when the list is already filtered to one employee. */
  readonly hideEmployeeName?: boolean;
  readonly todayDate?: BusinessDate;
}

function DailySummaryBlock({
  summary,
  t,
}: {
  readonly summary: TimeEntryDailySummary;
  readonly t: Awaited<ReturnType<typeof getTranslations>>;
}) {
  const reported = formatWorkHoursValue(summary.reportedTotal);
  const lines: string[] = [t('time.mobile.reportedToday', { hours: reported })];

  if (summary.frameworkHours) {
    lines.push(t('time.mobile.dailyFramework', { hours: formatWorkHoursValue(summary.frameworkHours) }));
    if (summary.excessHours) {
      lines.push(t('time.mobile.excess', { hours: formatWorkHoursValue(summary.excessHours) }));
    } else {
      const remaining = Math.max(
        0,
        Number(summary.frameworkHours) - Number(summary.reportedTotal),
      );
      lines.push(t('time.mobile.remaining', { hours: formatWorkHoursValue(remaining) }));
    }
  }

  return (
    <div className="rounded-md bg-[var(--pf-bg-muted)] px-3 py-2 text-xs leading-relaxed text-[var(--pf-text-secondary)]">
      {lines.map((line) => (
        <p key={line}>{line}</p>
      ))}
      {summary.hasPendingExcess ? (
        <p className="mt-1 font-medium text-[var(--pf-status-warning-fg)]">
          {t('time.mobile.excessPendingBadge')}
        </p>
      ) : null}
    </div>
  );
}

function MobileEntryRow({
  entry,
  t,
  showCosts,
  canLogTime,
  projectScoped,
  hideEmployeeName,
  compact,
}: {
  readonly entry: TimeEntryListItem;
  readonly t: Awaited<ReturnType<typeof getTranslations>>;
  readonly showCosts: boolean;
  readonly canLogTime: boolean;
  readonly projectScoped: boolean;
  readonly hideEmployeeName: boolean;
  readonly compact?: boolean;
}) {
  const status = resolveTimeEntryStatusLabel(entry, t);
  const target = entryTargetLine(entry, t, { projectScoped });
  const excessLine =
    entry.excessHours && Number(entry.excessHours) > 0
      ? t('time.mobile.excessEntryLine', {
          hours: formatWorkHoursValue(entry.excessHours),
          status:
            entry.excessApprovalStatus === 'approved'
              ? t('time.mobile.excessApprovedShort')
              : entry.excessApprovalStatus === 'rejected'
                ? t('time.mobile.excessRejectedShort')
                : t('time.mobile.excessPendingShort'),
        })
      : null;

  const hoursLabel = formatHoursWithUnit(entry.hours, t);

  if (compact) {
    return (
      <article
        className={`border-b border-[var(--pf-border-default)] px-3 py-2 last:border-b-0 ${
          entry.status === 'void' ? 'opacity-60' : ''
        }`}
      >
        <div className="flex min-w-0 items-start justify-between gap-2">
          <div className="min-w-0 flex-1 text-start">
            {!hideEmployeeName ? (
              <p className="truncate text-sm font-medium">{entry.employeeName}</p>
            ) : null}
            {target ? (
              <p className="truncate text-xs text-[var(--pf-text-secondary)]">{target}</p>
            ) : null}
            <p className="mt-0.5 text-sm font-semibold tabular-nums">{hoursLabel}</p>
            {excessLine ? (
              <p className="mt-0.5 text-xs text-[var(--pf-status-warning-fg)]">{excessLine}</p>
            ) : null}
          </div>
          {entry.status === 'recorded' ? (
            <StatusBadge
              shape={status.shape === 'void' ? 'draft' : status.shape}
              label={status.primary}
            />
          ) : (
            <StatusBadge shape="draft" label={status.primary} />
          )}
        </div>
        {entry.approvalStatus === 'returned' && entry.managerNote ? (
          <p className="mt-1 text-start text-xs text-[var(--pf-text-secondary)]">{entry.managerNote}</p>
        ) : null}
        {canLogTime ? (
          <TimeEntryMobileActions
            entryId={entry.id}
            employeeId={entry.employeeId}
            hours={entry.hours}
            approvalStatus={entry.approvalStatus}
            status={entry.status}
          />
        ) : null}
      </article>
    );
  }

  return (
    <article
      className={`rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)] px-3 py-2.5 ${
        entry.status === 'void' ? 'opacity-60' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1 text-start">
          {!hideEmployeeName ? (
            <p className="truncate text-sm font-medium">{entry.employeeName}</p>
          ) : null}
          {target ? (
            <p className="text-start text-sm text-[var(--pf-text-secondary)]">{target}</p>
          ) : null}
        </div>
        {entry.status === 'recorded' ? (
          <StatusBadge shape={status.shape === 'void' ? 'draft' : status.shape} label={status.primary} />
        ) : (
          <StatusBadge shape="draft" label={status.primary} />
        )}
      </div>

      <p className="mt-1.5 text-start text-base font-semibold tabular-nums">
        {formatHoursWithUnit(entry.hours, t)}
      </p>

      {excessLine ? (
        <p className="mt-0.5 text-start text-xs text-[var(--pf-status-warning-fg)]">{excessLine}</p>
      ) : null}

      {entry.correctsEntryId ? (
        <p className="mt-0.5 text-start text-xs text-[var(--pf-text-muted)]">
          {t('time.status.correction')}
        </p>
      ) : null}

      {entry.approvalStatus === 'returned' && entry.managerNote ? (
        <p className="mt-1 text-start text-xs text-[var(--pf-text-secondary)]">{entry.managerNote}</p>
      ) : null}

      {showCosts && entry.costAmount && entry.costCurrency ? (
        <p className="mt-1 text-start text-sm text-[var(--pf-text-secondary)]">
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

      {canLogTime ? (
        <TimeEntryMobileActions
          entryId={entry.id}
          employeeId={entry.employeeId}
          hours={entry.hours}
          approvalStatus={entry.approvalStatus}
          status={entry.status}
        />
      ) : null}
    </article>
  );
}

export async function TimeEntriesMobileList({
  entries,
  showCosts,
  canLogTime,
  dailySummaries,
  projectScoped = false,
  hideEmployeeName = false,
  todayDate,
}: TimeEntriesMobileListProps) {
  const [t, locale] = await Promise.all([getTranslations('workforce'), getLocale()]);
  const groups = groupTimeEntriesByDate(entries);

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-3" data-pf-time-mobile-list>
      {groups.map((group) => {
        const dateLabel =
          todayDate && group.workDate === todayDate
            ? t('time.mobile.today')
            : formatBusinessDate(coerceBusinessDate(group.workDate), locale, 'short');

        const employeeIdsInDay = [...new Set(group.entries.map((entry) => entry.employeeId))];

        return (
          <section key={group.workDate} className="min-w-0">
            <header className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-b border-[var(--pf-border-default)] pb-2">
              <h3 className="text-sm font-semibold" dir="ltr">
                {dateLabel}
              </h3>
              <p className="text-xs text-[var(--pf-text-muted)]">
                {t('time.mobile.dayTotal', { hours: formatWorkHoursValue(group.dayTotalHours) })}
              </p>
            </header>

            <div className="flex flex-col gap-3">
              {employeeIdsInDay.map((employeeId) => {
                const employeeEntries = group.entries.filter(
                  (entry) => entry.employeeId === employeeId,
                );
                const summaryKey = dailySummaryKey(employeeId, group.workDate);
                const summary = dailySummaries.get(summaryKey);
                const showEmployeeHeader = !hideEmployeeName && employeeIdsInDay.length > 1;

                return (
                  <div key={summaryKey} className="flex flex-col gap-2">
                    {showEmployeeHeader ? (
                      <p className="text-sm font-medium">{employeeEntries[0]?.employeeName}</p>
                    ) : null}
                    {summary ? <DailySummaryBlock summary={summary} t={t} /> : null}
                    <div
                      className={
                        projectScoped
                          ? 'overflow-hidden rounded-md border border-[var(--pf-border-default)] bg-[var(--pf-bg-surface)]'
                          : 'flex flex-col gap-2'
                      }
                    >
                      {employeeEntries.map((entry) => (
                        <MobileEntryRow
                          key={entry.id}
                          entry={entry}
                          t={t}
                          showCosts={showCosts}
                          canLogTime={canLogTime}
                          projectScoped={projectScoped}
                          hideEmployeeName={hideEmployeeName || showEmployeeHeader}
                          compact={projectScoped}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}
    </div>
  );
}
