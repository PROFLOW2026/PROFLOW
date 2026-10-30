import { getTranslations } from 'next-intl/server';
import { DateRangeGetForm } from '@/components/patterns/date-range-get-form';
import { MainAppListBody, MainAppTableShell } from '@/components/patterns/main-app';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { compareMoney } from '@/shared/money';
import type { ReportPayload } from '@/modules/reports/domain/types';
import type { RecognizedCostBreakdownData } from '../application/get-recognized-cost-breakdown';
import type { RecognizedCostBreakdownLine } from '../data/expenses.repository';
import { FinancialReportPrintPanel } from './financial-report-print-panel';

export async function RecognizedCostBreakdownView({
  data,
  today,
  printPayload,
}: {
  readonly data: RecognizedCostBreakdownData;
  readonly today: string;
  readonly printPayload: ReportPayload;
}) {
  const t = await getTranslations('financial.overview.recognizedBreakdown');
  const tRange = await getTranslations('common.dateRange');

  const parityOk = compareMoney(data.totalNet, data.kpiNet) === 0;

  return (
    <MainAppListBody className="gap-6 pb-24 lg:pb-6">
      <DateRangeGetForm
        today={today}
        defaultFrom={data.period.fromDate}
        defaultTo={data.period.toDate}
        labels={{
          thisWeek: tRange('thisWeek'),
          thisMonth: tRange('thisMonth'),
          thisYear: tRange('thisYear'),
          from: tRange('from'),
          to: tRange('to'),
          apply: tRange('apply'),
        }}
        actions={
          <Link href={`/financials/overview?fromDate=${data.period.fromDate}&toDate=${data.period.toDate}`} className={textNavLinkClassName}>
            {t('backToOverview')}
          </Link>
        }
      />

      <FinancialReportPrintPanel payload={printPayload} />

      {!parityOk ? <Alert tone="warning">{t('parityWarning')}</Alert> : null}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="min-w-0 text-base">{t('totalTitle')}</CardTitle>
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

      {data.lines.length === 0 ? (
        <p className="text-center text-sm text-[var(--pf-text-muted)] lg:hidden">{t('empty')}</p>
      ) : null}

      <ResponsiveTable
        items={data.lines}
        getRowKey={(line) => line.id}
        desktop={
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
                    <RecognizedRow
                      key={line.id}
                      line={line}
                      t={t as (key: string, values?: Record<string, string | number>) => string}
                    />
                  ))
                )}
              </TableBody>
            </Table>
          </MainAppTableShell>
        }
        renderMobileCard={(line) => (
          <RecognizedMobileCard
            line={line}
            t={t as (key: string, values?: Record<string, string | number>) => string}
          />
        )}
      />
    </MainAppListBody>
  );
}

function RecognizedMobileCard({
  line,
  t,
}: {
  line: RecognizedCostBreakdownLine;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  const description = lineDescription(line, t);
  const allocation = allocationLabel(line, t);

  return (
    <Card className="min-w-0">
      <CardContent className="flex flex-col gap-2 p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">{line.recognitionDate}</span>
          <span className="text-xs text-[var(--pf-text-secondary)]">{t(`source.${line.sourceKind}`)}</span>
        </div>
        <p className="text-[var(--pf-text-secondary)]">{description}</p>
        {line.party ? <p className="text-xs">{line.party}</p> : null}
        <p className="text-xs text-[var(--pf-text-muted)]">{allocation}</p>
        <dl className="grid grid-cols-3 gap-2 border-t border-[var(--pf-border-default)] pt-2 text-xs">
          <div>
            <dt className="text-[var(--pf-text-muted)]">{t('columnNet')}</dt>
            <dd className="font-medium">
              <MoneyText value={line.net} />
            </dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-muted)]">{t('columnVat')}</dt>
            <dd className="font-medium">
              <MoneyText value={line.vat} />
            </dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-muted)]">{t('columnGross')}</dt>
            <dd className="font-medium">
              <MoneyText value={line.gross} />
            </dd>
          </div>
        </dl>
        <Link href={line.href} className={textNavLinkClassName}>
          {t('openRecord')}
        </Link>
      </CardContent>
    </Card>
  );
}

function RecognizedRow({
  line,
  t,
}: {
  line: RecognizedCostBreakdownLine;
  t: (key: string, values?: Record<string, string | number>) => string;
}) {
  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-sm">{line.recognitionDate}</TableCell>
      <TableCell className="text-sm">{t(`source.${line.sourceKind}`)}</TableCell>
      <TableCell className="max-w-[8rem] truncate text-sm">{line.party || '—'}</TableCell>
      <TableCell className="max-w-[12rem] truncate text-sm">{lineDescription(line, t)}</TableCell>
      <TableCell className="max-w-[10rem] truncate text-sm">{allocationLabel(line, t)}</TableCell>
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

function lineDescription(
  line: RecognizedCostBreakdownLine,
  t: (key: string, values?: Record<string, string | number>) => string,
): string {
  if (line.sourceKind === 'employer_cost') {
    return t('emcDescription', { month: line.description });
  }
  if (line.installmentCount > 1) {
    return t('installmentDescription', {
      text: line.description || t('fallbackExpense'),
      month: line.yearMonth,
    });
  }
  return line.description || t('fallbackExpense');
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
