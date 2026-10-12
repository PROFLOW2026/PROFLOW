import { getLocale, getTranslations } from 'next-intl/server';
import { DateRangeSelector } from '@/components/patterns/date-range-selector';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { addMoney, compareMoney, zeroMoney } from '@/shared/money';
import type { CashPaidBreakdownData } from '../application/get-cash-paid-breakdown';
import {
  cashLineDisplayText,
  type MonthCashPaidLine,
  type MonthCashSource,
} from '../domain/month-cash-flow';
import { formatPayrollPeriodDocument } from '../domain/payroll-cash-display';

export async function CashPaidBreakdownView({
  data,
  today,
}: {
  readonly data: CashPaidBreakdownData;
  readonly today: string;
}) {
  const t = await getTranslations('financial.overview.cashPaidBreakdown');
  const tRange = await getTranslations('common.dateRange');
  const tOverview = await getTranslations('financial.overview');
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
    <div className="flex min-w-0 flex-col gap-6">
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

      <Alert tone="info">{t('scopeHint')}</Alert>
      {!parityOk ? (
        <Alert tone="warning">{t('parityWarning')}</Alert>
      ) : null}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle className="text-base">{t('totalTitle')}</CardTitle>
          <p className="text-xs text-[var(--pf-text-muted)]">{tOverview('cashPaidHint')}</p>
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

      <div className="min-w-0 overflow-x-auto rounded-lg border border-[var(--pf-border-default)]">
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
      </div>
    </div>
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
      <TableCell className="max-w-[8rem] truncate text-sm">
        {cashLineDisplayText(line.party) || '—'}
      </TableCell>
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
