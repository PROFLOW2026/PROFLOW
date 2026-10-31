'use client';

import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { formatBusinessDate } from '@/shared/dates/format';
import { money } from '@/shared/money';
import { formatPercentDisplay } from '@/shared/number/display';
import { Link } from '@/shared/i18n/navigation';
import type {
  VendorFinancialActivity,
  VendorFinancialAmountBasis,
} from '../application/get-vendor-financial-activity';

export function VendorFinancialActivityView({
  activity,
  locale,
}: {
  readonly activity: VendorFinancialActivity;
  readonly locale: string;
}) {
  const t = useTranslations('vendors.financialActivity');
  const [basis, setBasis] = useState<VendorFinancialAmountBasis>('net');
  const totals = basis === 'net' ? activity.totals.net : activity.totals.gross;

  const metricLabels = useMemo(
    () => ({
      recognized: basis === 'net' ? t('recognizedCost') : t('recognizedCostGross'),
      paid: basis === 'net' ? t('paidNet') : t('paidGross'),
      outstanding: basis === 'net' ? t('outstandingNet') : t('outstandingGross'),
    }),
    [basis, t],
  );

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">{t('title')}</CardTitle>
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
            {activity.aggregateVendorIds.length > 1 ? (
              <p className="text-xs text-[var(--pf-text-muted)]">{t('aggregateScope')}</p>
            ) : null}
          </div>
          <div
            className="inline-flex w-full max-w-full shrink-0 rounded-md border border-[var(--pf-border-default)] p-0.5 sm:w-auto"
            role="group"
            aria-label={t('basisToggleLabel')}
          >
            <BasisButton active={basis === 'net'} onClick={() => setBasis('net')}>
              {t('basisNet')}
            </BasisButton>
            <BasisButton active={basis === 'gross'} onClick={() => setBasis('gross')}>
              {t('basisGross')}
            </BasisButton>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Metric label={metricLabels.recognized} amount={totals.recognized} currency={activity.totals.currency} />
          <Metric label={metricLabels.paid} amount={totals.paid} currency={activity.totals.currency} />
          <Metric label={metricLabels.outstanding} amount={totals.outstanding} currency={activity.totals.currency} />
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('expenseCount')}</dt>
            <dd className="font-medium">{activity.totals.expenseCount}</dd>
          </div>
        </dl>

        {activity.derivedProjects.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('derivedProjects')}</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {activity.derivedProjects.map((project) => {
                const amount =
                  basis === 'net' ? project.recognizedNet : project.recognizedGross;
                return (
                  <li
                    key={project.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
                  >
                    <Link href={`/projects/${project.id}`} className={textNavLinkClassName}>
                      {project.name}
                    </Link>
                    <span className="text-xs text-[var(--pf-text-muted)]">
                      {t('projectExpenseCount', { count: project.expenseCount })}
                    </span>
                    <MoneyText value={money(amount, project.currency)} />
                  </li>
                );
              })}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('expensesTitle')}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {activity.expenses.map((row) => {
              const lineAmount = basis === 'net' ? row.netAmount : row.grossAmount;
              const linePaid = basis === 'net' ? row.paidNetAmount : row.paidGrossAmount ?? '0';
              return (
                <li
                  key={row.id}
                  className="flex flex-col gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between"
                >
                  <Link href={`/expenses/${row.id}`} className={textNavLinkClassName}>
                    {row.description?.trim() || t('untitledExpense')}
                  </Link>
                  <span dir="ltr" className="text-xs text-[var(--pf-text-muted)]">
                    {formatBusinessDate(row.expenseDate, locale)}
                  </span>
                  <ExpenseKindBadge kind={row.kind} label={t(`kind.${row.kind}`)} />
                  <ProjectSummary row={row} t={t} />
                  <div className="flex flex-col items-end gap-0.5 text-xs">
                    <MoneyText value={money(lineAmount, row.currency)} />
                    {Number(linePaid) > 0 ? (
                      <span className="text-[var(--pf-text-muted)]">
                        {t('linePaid')}: <MoneyText value={money(linePaid, row.currency)} />
                      </span>
                    ) : null}
                  </div>
                  <ExpenseStatusBadge status={row.status} label={t(`expenseStatus.${row.status}`)} />
                  <PaymentStatusBadge row={row} t={t} />
                </li>
              );
            })}
          </ul>
        </section>
      </CardContent>
    </Card>
  );
}

function BasisButton({
  active,
  onClick,
  children,
}: {
  readonly active: boolean;
  readonly onClick: () => void;
  readonly children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`min-h-9 flex-1 rounded px-3 py-1.5 text-sm font-medium sm:flex-none ${
        active
          ? 'bg-[var(--pf-surface-elevated)] text-[var(--pf-text-primary)] shadow-sm'
          : 'text-[var(--pf-text-secondary)]'
      }`}
    >
      {children}
    </button>
  );
}

function Metric({
  label,
  amount,
  currency,
}: {
  readonly label: string;
  readonly amount: string;
  readonly currency: string;
}) {
  return (
    <div>
      <dt className="text-xs text-[var(--pf-text-muted)]">{label}</dt>
      <dd>
        <MoneyText value={money(amount, currency)} />
      </dd>
    </div>
  );
}

function ExpenseKindBadge({ kind, label }: { readonly kind: string; readonly label: string }) {
  const shape =
    kind === 'reversal' ? 'cancelled' : kind === 'adjustment' ? 'pending' : 'completed';
  return <StatusBadge shape={shape} label={label} />;
}

function ExpenseStatusBadge({ status, label }: { readonly status: string; readonly label: string }) {
  const shape =
    status === 'finalized' ? 'approved' : status === 'void' ? 'cancelled' : 'draft';
  return <StatusBadge shape={shape} label={label} />;
}

function PaymentStatusBadge({
  row,
  t,
}: {
  readonly row: VendorFinancialActivity['expenses'][number];
  readonly t: ReturnType<typeof useTranslations<'vendors.financialActivity'>>;
}) {
  const display = row.paymentDisplay;
  const shape =
    display === 'paid'
      ? 'approved'
      : display === 'overdue'
        ? 'overdue'
        : display === 'cancelled'
          ? 'cancelled'
          : display === 'not_applicable'
            ? 'draft'
            : 'pending';
  const label =
    display === 'paid'
      ? t('paid')
      : display === 'overdue'
        ? t('overdue')
        : display === 'cancelled'
          ? t('cancelled')
          : display === 'not_applicable'
            ? t('paymentNotApplicable')
            : t('unpaid');
  return <StatusBadge shape={shape} label={label} />;
}

function ProjectSummary({
  row,
  t,
}: {
  readonly row: VendorFinancialActivity['expenses'][number];
  readonly t: ReturnType<typeof useTranslations<'vendors.financialActivity'>>;
}) {
  if (row.projectAllocationCount > 1) {
    return (
      <details className="min-w-0 text-xs text-[var(--pf-text-secondary)]">
        <summary>{t('multiProjectLabel', { count: row.projectAllocationCount })}</summary>
        <ul className="mt-2 flex flex-col gap-2 ps-1">
          {row.projectAllocations.map((line) => (
            <li
              key={`${row.id}-${line.projectId}`}
              className="flex flex-col gap-0.5 rounded-md border border-[var(--pf-border-default)] px-2 py-1.5"
            >
              <span className="font-medium text-[var(--pf-text-primary)]">{line.projectName}</span>
              {line.percent ? <span dir="ltr">{formatPercentDisplay(line.percent)}</span> : null}
              <MoneyText value={money(line.netAmount, row.currency)} />
            </li>
          ))}
        </ul>
      </details>
    );
  }
  if (row.projectAllocationCount === 1) {
    return (
      <span className="text-xs text-[var(--pf-text-secondary)]">
        {t('projectLabel', { name: row.projectAllocations[0]!.projectName })}
      </span>
    );
  }
  if (row.projectName) {
    return (
      <span className="text-xs text-[var(--pf-text-secondary)]">
        {t('projectLabel', { name: row.projectName })}
      </span>
    );
  }
  if (row.allocationIntent === 'auto_pool') {
    return <span className="text-xs text-[var(--pf-text-secondary)]">{t('autoPool')}</span>;
  }
  return <span className="text-xs text-[var(--pf-text-secondary)]">{t('generalBusiness')}</span>;
}
