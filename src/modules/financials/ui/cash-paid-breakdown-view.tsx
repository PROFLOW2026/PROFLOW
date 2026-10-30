import { getLocale, getTranslations } from 'next-intl/server';
import { DateRangeGetForm } from '@/components/patterns/date-range-get-form';
import { MainAppListBody, MainAppTableShell } from '@/components/patterns/main-app';
import { ResponsiveTable } from '@/components/patterns/responsive-table';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { addMoney, compareMoney, zeroMoney } from '@/shared/money';
import type { ReportPayload } from '@/modules/reports/domain/types';
import type { CashPaidBreakdownData } from '../application/get-cash-paid-breakdown';
import {
  cashLineDisplayText,
  type MonthCashPaidLine,
  type MonthCashSource,
} from '../domain/month-cash-flow';
import { formatPayrollPeriodDocument } from '../domain/payroll-cash-display';
import { FinancialReportPrintPanel } from './financial-report-print-panel';

export async function CashPaidBreakdownView({
  data,
  today,
  printPayload,
}: {
  readonly data: CashPaidBreakdownData;
  readonly today: string;
  readonly printPayload: ReportPayload;
}) {
  const t = await getTranslations('financial.overview.cashPaidBreakdown');
  const tRange = await getTranslations('common.dateRange');
  const locale = await getLocale();

  const sourceLabels: Record<MonthCashSource, string> = {
    payroll: t('source.payroll'),
    expense: t('source.expense'),
    ap: t('source.ap'),
    subcontract_advance: t('source.subcontract_advance'),
  };

  let sumPaid = zeroMoney(data.currency);
  for (const line of data.paidLines) {
    sumPaid = addMoney(sumPaid, line.amount);
  }
  const parityOk = compareMoney(sumPaid, data.kpiPaid) === 0;
  const display = data.flow.display.paid;

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
            <MoneyText value={display.net} className="text-lg font-semibold" />
          </div>
          <div>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('columnVat')}</p>
            <MoneyText value={display.vat} className="text-lg font-semibold" />
          </div>
          <div>
            <p className="text-xs text-[var(--pf-text-secondary)]">{t('columnGross')}</p>
            <MoneyText value={display.gross} className="text-lg font-semibold" />
          </div>
        </CardContent>
      </Card>

      {data.paidLines.length === 0 ? (
        <p className="text-center text-sm text-[var(--pf-text-muted)] lg:hidden">{t('empty')}</p>
      ) : null}

      <ResponsiveTable
        items={data.paidLines}
        getRowKey={(line) => line.id}
        desktop={
          <MainAppTableShell>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('columnPaymentDate')}</TableHead>
                  <TableHead>{t('columnSource')}</TableHead>
                  <TableHead>{t('columnParty')}</TableHead>
                  <TableHead>{t('columnDocument')}</TableHead>
                  <TableHead className="text-end">{t('columnNet')}</TableHead>
                  <TableHead className="text-end">{t('columnVat')}</TableHead>
                  <TableHead className="text-end">{t('columnGross')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.paidLines.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-sm text-[var(--pf-text-muted)]">
                      {t('empty')}
                    </TableCell>
                  </TableRow>
                ) : (
                  data.paidLines.map((line) => (
                    <PaidRow key={line.id} line={line} sourceLabels={sourceLabels} locale={locale} />
                  ))
                )}
              </TableBody>
            </Table>
          </MainAppTableShell>
        }
        renderMobileCard={(line) => (
          <PaidMobileCard line={line} sourceLabels={sourceLabels} locale={locale} t={t} />
        )}
      />
    </MainAppListBody>
  );
}

function PaidMobileCard({
  line,
  sourceLabels,
  locale,
  t,
}: {
  line: MonthCashPaidLine;
  sourceLabels: Record<MonthCashSource, string>;
  locale: string;
  t: (key: string) => string;
}) {
  const triplet = line.display;
  const net = triplet?.net ?? line.amount;
  const gross = triplet?.gross ?? line.amount;
  const vat = triplet?.vat ?? zeroMoney(line.amount.currency);
  const document = cashDrilldownLabel(line, sourceLabels, locale);

  return (
    <Card className="min-w-0">
      <CardContent className="flex flex-col gap-2 p-4 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="font-medium">{line.paymentDate}</span>
          <span className="text-xs text-[var(--pf-text-secondary)]">{sourceLabels[line.source]}</span>
        </div>
        {line.party ? <p className="text-xs">{cashLineDisplayText(line.party)}</p> : null}
        <p className="text-[var(--pf-text-secondary)]">{document}</p>
        <dl className="grid grid-cols-3 gap-2 border-t border-[var(--pf-border-default)] pt-2 text-xs">
          <div>
            <dt className="text-[var(--pf-text-muted)]">{t('columnNet')}</dt>
            <dd className="font-medium">
              <MoneyText value={net} />
            </dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-muted)]">{t('columnVat')}</dt>
            <dd className="font-medium">
              <MoneyText value={vat} />
            </dd>
          </div>
          <div>
            <dt className="text-[var(--pf-text-muted)]">{t('columnGross')}</dt>
            <dd className="font-medium">
              <MoneyText value={gross} />
            </dd>
          </div>
        </dl>
      </CardContent>
    </Card>
  );
}

function PaidRow({
  line,
  sourceLabels,
  locale,
}: {
  line: MonthCashPaidLine;
  sourceLabels: Record<MonthCashSource, string>;
  locale: string;
}) {
  const triplet = line.display;
  const net = triplet?.net ?? line.amount;
  const gross = triplet?.gross ?? line.amount;
  const vat = triplet?.vat ?? zeroMoney(line.amount.currency);
  const document = cashDrilldownLabel(line, sourceLabels, locale);

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-sm">{line.paymentDate}</TableCell>
      <TableCell className="text-sm">{sourceLabels[line.source]}</TableCell>
      <TableCell className="max-w-[8rem] truncate text-sm">{cashLineDisplayText(line.party) || '—'}</TableCell>
      <TableCell className="max-w-[14rem] truncate text-sm">{document}</TableCell>
      <TableCell className="text-end text-sm">
        <MoneyText value={net} />
      </TableCell>
      <TableCell className="text-end text-sm">
        <MoneyText value={vat} />
      </TableCell>
      <TableCell className="text-end text-sm">
        <MoneyText value={gross} />
      </TableCell>
    </TableRow>
  );
}

function cashDrilldownLabel(
  line: MonthCashPaidLine,
  sourceLabels: Record<MonthCashSource, string>,
  locale: string,
): string {
  const parts = [line.document, line.reference ?? ''];
  const visible = parts
    .map((part, index) => {
      if (line.source === 'payroll' && index === 0 && part) {
        return formatPayrollPeriodDocument(part, locale);
      }
      return cashLineDisplayText(part);
    })
    .filter(Boolean);
  if (visible.length === 0) return sourceLabels[line.source];
  return visible.join(' · ');
}
