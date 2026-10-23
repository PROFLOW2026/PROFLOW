'use client';

import { useState } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { BillingNetPrimaryDisplay } from '@/components/patterns/billing-net-primary-display';
import { MoneyText } from '@/components/patterns/money-text';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { compareMoney } from '@/shared/money';
import type {
  HomeMonthlyLedger,
  HomeMonthlyLedgerLine,
  HomeMonthlyLedgerPair,
} from '../domain/home-monthly-ledger';

function Amount({
  value,
  result = false,
}: {
  readonly value: HomeMonthlyLedgerPair | null;
  readonly result?: boolean;
}) {
  const t = useTranslations('dashboard.monthlyLedger');
  if (!value) return <span>—</span>;
  const gross =
    value.net.currency === value.gross.currency && compareMoney(value.net, value.gross) !== 0
      ? value.gross
      : null;
  if (!gross) {
    return <MoneyText value={value.net} colorizeResult={result} />;
  }
  return (
    <BillingNetPrimaryDisplay
      netAmount={value.net}
      grossAmount={gross}
      grossLabel={t('includingVat')}
      colorizeResult={result}
      netClassName="text-sm"
    />
  );
}

function Lines({
  title,
  rows,
}: {
  readonly title: string;
  readonly rows: readonly HomeMonthlyLedgerLine[];
}) {
  const t = useTranslations('dashboard.monthlyLedger');
  if (rows.length === 0) return null;
  return (
    <div className="flex min-w-0 flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('colName')}</TableHead>
            <TableHead>{t('colDate')}</TableHead>
            <TableHead numeric>{t('colAmount')}</TableHead>
            <TableHead>{t('colStatus')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                {row.href ? (
                  <Link href={row.href} className={textNavLinkClassName}>
                    {row.name === 'unallocated' ? t('unallocated') : row.name}
                  </Link>
                ) : row.name === 'unallocated' ? (
                  t('unallocated')
                ) : (
                  row.name
                )}
              </TableCell>
              <TableCell>{row.date ?? '—'}</TableCell>
              <TableCell numeric>
                <Amount value={{ net: row.net, gross: row.gross }} />
              </TableCell>
              <TableCell>
                {row.status && t.has(`status.${row.status}` as 'status.paid')
                  ? t(`status.${row.status}` as 'status.paid')
                  : (row.status ?? '—')}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function LedgerNotes() {
  const t = useTranslations('dashboard.monthlyLedger');
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="secondary">
          {t('detail')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t('title')}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex flex-col gap-3 text-sm text-[var(--pf-text-secondary)]">
          <p>{t('hint')}</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

function MonthDetail({
  month,
}: {
  readonly month: HomeMonthlyLedger['months'][number];
}) {
  const t = useTranslations('dashboard.monthlyLedger');
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button type="button" size="sm" variant="secondary">
          {t('detail')}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{month.yearMonth}</DialogTitle>
        </DialogHeader>
        <DialogBody className="flex min-w-0 flex-col gap-4">
          <Lines title={t('invoiced')} rows={month.invoices} />
          <Lines title={t('collected')} rows={month.collections} />
          <Lines title={t('expensesRecorded')} rows={month.recordedExpenses} />
          <Lines title={t('expensesPaid')} rows={month.expensePayments} />
          <Lines title={t('payrollPaid')} rows={month.payrollPayments} />
          <Lines title={t('employerCosts')} rows={month.employerCosts} />
          <Lines title={t('payables')} rows={month.payables} />
          <Lines title={t('receivablesEnd')} rows={month.receivables} />
          <Lines title={t('recognizedCost')} rows={month.costParts} />
          <Lines title={t('otherCashOut')} rows={month.otherCashOut} />
          <div className="text-sm">
            {t('monthDifference')}: <Amount value={month.monthDifference} result />
          </div>
          <div className="text-sm">
            {t('cumulativeDifference')}: <Amount value={month.cumulativeDifference} result />
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function HomeDashboardMonthlyLedger({
  ledger,
}: {
  readonly ledger: HomeMonthlyLedger;
}) {
  const t = useTranslations('dashboard.monthlyLedger');
  const locale = useLocale();
  const fields: {
    key: string;
    label: string;
    value: (month: HomeMonthlyLedger['months'][number]) => HomeMonthlyLedgerPair | null;
    result?: boolean;
  }[] = [
    { key: 'invoiced', label: t('invoiced'), value: (month) => month.invoiced },
    { key: 'collected', label: t('collected'), value: (month) => month.collected },
    { key: 'receivablesEnd', label: t('receivablesEnd'), value: (month) => month.receivablesEnd },
    { key: 'expensesRecorded', label: t('expensesRecorded'), value: (month) => month.expensesRecorded },
    { key: 'expensesPaid', label: t('expensesPaid'), value: (month) => month.expensesPaid },
    { key: 'payrollPaid', label: t('payrollPaid'), value: (month) => month.payrollPaid },
    { key: 'cashOut', label: t('cashOut'), value: (month) => month.cashOut },
    { key: 'payableEnd', label: t('payableEnd'), value: (month) => month.payableEnd },
    { key: 'recognizedCost', label: t('recognizedCost'), value: (month) => month.recognizedCost },
    { key: 'monthDifference', label: t('monthDifference'), value: (month) => month.monthDifference, result: true },
    {
      key: 'cumulativeDifference',
      label: t('cumulativeDifference'),
      value: (month) => month.cumulativeDifference,
      result: true,
    },
  ];

  return (
    <section className="flex min-w-0 max-w-full flex-col gap-3">
      <div className="flex min-w-0 items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">{t('title')}</h2>
        <LedgerNotes />
      </div>
      <div className="flex min-w-0 flex-col gap-3">
        {ledger.months.map((month) => {
          const label = new Intl.DateTimeFormat(locale, { month: 'long', year: 'numeric' }).format(
            new Date(`${month.yearMonth}-01T00:00:00`),
          );
          return (
            <Card key={month.yearMonth} className="min-w-0 max-w-full">
              <CardContent className="flex min-w-0 flex-col gap-3 p-4">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-2">
                  <h3 className="text-sm font-semibold">{label}</h3>
                  <MonthDetail month={month} />
                </div>
                <dl className="grid min-w-0 grid-cols-2 gap-3 sm:grid-cols-3">
                  {fields.map((field) => (
                    <div key={field.key} className="min-w-0">
                      <dt className="break-words text-xs text-[var(--pf-text-muted)]">{field.label}</dt>
                      <dd className="mt-1 text-sm font-medium">
                        <Amount value={field.value(month)} result={field.result} />
                      </dd>
                    </div>
                  ))}
                </dl>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
