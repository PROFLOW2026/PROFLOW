import { getTranslations } from 'next-intl/server';
import { MainAppListBody, MainAppTableShell } from '@/components/patterns/main-app';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { ContextualInfo } from '@/components/ui/contextual-info';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { compareMoney } from '@/shared/money';
import type { RecognizedCostBreakdownData } from '../application/get-recognized-cost-breakdown';
import type { RecognizedCostBreakdownLine } from '../data/expenses.repository';

export async function RecognizedCostBreakdownView({
  data,
  today,
}: {
  readonly data: RecognizedCostBreakdownData;
  readonly today: string;
}) {
  const t = await getTranslations('financial.overview.recognizedBreakdown');
  const tRange = await getTranslations('common.dateRange');
  const tOverview = await getTranslations('financial.overview');

  const parityOk = compareMoney(data.totalNet, data.kpiNet) === 0;

  return (
    <MainAppListBody className="gap-6">
      <form method="get" className="rounded-lg border border-[var(--pf-border-default)] p-3">
        <DateRangeSelector
          today={today}
          defaultFrom={data.period.fromDate}
          defaultTo={data.period.toDate}
          labels={{
            thisMonth: tRange('thisMonth'),
            lastMonth: tRange('lastMonth'),
            last30Days: tRange('last30Days'),
            last90Days: tRange('last90Days'),
            thisYear: tRange('thisYear'),
            lastYear: tRange('lastYear'),
            from: tRange('from'),
            to: tRange('to'),
            apply: tRange('apply'),
          }}
        />
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="submit"
            className="h-9 rounded-md border border-[var(--pf-border-strong)] px-4 text-sm font-medium"
          >
            {tRange('apply')}
          </button>
          <Link href="/financials/overview" className={textNavLinkClassName}>
            {t('backToOverview')}
          </Link>
        </div>
      </form>

      <div className="flex justify-end">
        <ContextualInfo dialogTitle={t('totalTitle')} content={t('scopeHint')} size="sm" />
      </div>
      {!parityOk ? (
        <Alert tone="warning">{t('parityWarning')}</Alert>
      ) : null}

      <Card className="min-w-0">
        <CardHeader>
          <div className="flex items-start gap-1">
            <CardTitle className="min-w-0 flex-1 text-base">{t('totalTitle')}</CardTitle>
            <ContextualInfo
              dialogTitle={t('totalTitle')}
              content={tOverview('recognizedActualHint')}
              size="sm"
            />
          </div>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-wrap gap-6">
          <div>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('columnNet')}</p>
            <MoneyText value={data.totalNet} className="text-lg font-semibold" />
            <p className="text-xs text-[var(--pf-text-muted)]">{t('kpiNetLabel')}</p>
          </div>
          <div>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('columnVat')}</p>
            <MoneyText value={data.totalVat} className="text-lg font-semibold" />
          </div>
          <div>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('columnGross')}</p>
            <MoneyText value={data.totalGross} className="text-lg font-semibold" />
          </div>
        </CardContent>
      </Card>

      <MainAppTableShell>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t('columnRecognitionDate')}</TableHead>
              <TableHead>{t('columnSource')}</TableHead>
              <TableHead>{t('columnParty')}</TableHead>
              <TableHead>{t('columnDescription')}</TableHead>
              <TableHead>{t('columnAllocation')}</TableHead>
              <TableHead className="text-end">{t('columnNet')}</TableHead>
              <TableHead className="text-end">{t('columnVat')}</TableHead>
              <TableHead className="text-end">{t('columnGross')}</TableHead>
              <TableHead />
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.lines.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} className="text-center text-sm text-[var(--pf-text-muted)]">
                  {t('empty')}
                </TableCell>
              </TableRow>
            ) : (
              data.lines.map((line) => (
                <RecognizedRow key={line.id} line={line} t={t as (key: string, values?: Record<string, string | number>) => string} />
              ))
            )}
          </TableBody>
        </Table>
      </MainAppTableShell>
    </MainAppListBody>
  );
}

function RecognizedRow({
  line,
  t,
}: {
  line: RecognizedCostBreakdownLine;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const sourceLabel = t(`source.${line.sourceKind}`);
  const allocation = allocationLabel(line, t);
  const description =
    line.sourceKind === 'employer_cost'
      ? t('emcDescription', { month: line.description })
      : line.installmentCount > 1
        ? t('installmentDescription', {
            text: line.description || t('fallbackExpense'),
            month: line.yearMonth,
          })
        : line.description || t('fallbackExpense');

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-sm">{line.recognitionDate}</TableCell>
      <TableCell className="text-sm">{sourceLabel}</TableCell>
      <TableCell className="max-w-[8rem] truncate text-sm">{line.party || '—'}</TableCell>
      <TableCell className="max-w-[12rem] truncate text-sm">{description}</TableCell>
      <TableCell className="max-w-[10rem] truncate text-sm">{allocation}</TableCell>
      <TableCell className="text-end text-sm">
        <MoneyText value={line.net} />
      </TableCell>
      <TableCell className="text-end text-sm">
        <MoneyText value={line.vat} />
      </TableCell>
      <TableCell className="text-end text-sm">
        <MoneyText value={line.gross} />
      </TableCell>
      <TableCell className="text-end">
        <Link href={line.href} className={textNavLinkClassName}>
          {t('openRecord')}
        </Link>
      </TableCell>
    </TableRow>
  );
}

function allocationLabel(
  line: RecognizedCostBreakdownLine,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (line.sourceKind === 'employer_cost') {
    return t('allocation.employerCost');
  }
  if (line.projectName) {
    return t('allocation.project', { name: line.projectName });
  }
  if (line.costFamily === 'business_overhead') {
    return t('allocation.overhead');
  }
  if (line.sourceKind === 'ap_bill') {
    return t('allocation.apCompany');
  }
  return line.costFamily ? t('allocation.costFamily', { family: line.costFamily }) : t('allocation.unassigned');
}
