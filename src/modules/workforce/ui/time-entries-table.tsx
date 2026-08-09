import { getLocale, getTranslations } from 'next-intl/server';
import { Clock } from 'lucide-react';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { MoneyText } from '@/components/patterns/money-text';
import type { TimeEntryListItem } from '@/modules/workforce';
import { businessDate } from '@/shared/dates/dates';
import { formatBusinessDate } from '@/shared/dates/format';
import { fromNumericString } from '@/shared/money';
import { Link } from '@/shared/i18n/navigation';

interface TimeEntriesTableProps {
  readonly entries: readonly TimeEntryListItem[];
  readonly showCosts: boolean;
  readonly canLogTime: boolean;
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
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('time.columns.date')}</TableHead>
              <TableHead>{t('time.columns.employee')}</TableHead>
              <TableHead>{t('time.columns.target')}</TableHead>
              <TableHead numeric>{t('time.columns.hours')}</TableHead>
              {showCosts ? <TableHead numeric>{t('time.columns.cost')}</TableHead> : null}
            </TableRow>
          </TableHeader>
          <TableBody>
            {entries.map((entry) => (
              <TableRow key={entry.id}>
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
              </TableRow>
            ))}
          </TableBody>
        </Table>
      }
      renderMobileCard={(entry) => (
        <div className="min-h-11 rounded-lg border border-[var(--pf-border-default)] p-4">
          <div className="flex items-start justify-between gap-2">
            <div>
              <p className="font-medium">{entry.employeeName}</p>
              <p className="text-xs text-[var(--pf-text-muted)]" dir="ltr">
                {formatBusinessDate(businessDate(entry.workDate), locale, 'short')}
              </p>
            </div>
            <span className="pf-numeric text-sm font-semibold">
              {entry.hours} {t('time.hoursAbbrev')}
            </span>
          </div>
          <p className="mt-2 text-sm text-[var(--pf-text-secondary)]">{entryTarget(entry, t)}</p>
          {showCosts && entry.costAmount && entry.costCurrency ? (
            <p className="mt-1 text-sm">
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
        </div>
      )}
    />
  );
}
