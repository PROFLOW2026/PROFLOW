import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { formatBusinessDate } from '@/shared/dates/format';
import { money } from '@/shared/money';
import { Link } from '@/shared/i18n/navigation';
import type { VendorFinancialActivity } from '../application/get-vendor-financial-activity';

export async function VendorFinancialActivityPanel({
  activity,
  locale,
}: {
  readonly activity: VendorFinancialActivity | null;
  readonly locale: string;
}) {
  const t = await getTranslations('vendors.financialActivity');

  if (!activity || activity.expenses.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t('title')}</CardTitle>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Metric label={t('recognizedNet')} amount={activity.totals.recognizedNet} currency={activity.totals.currency} />
          <Metric label={t('paidGross')} amount={activity.totals.paidGross} currency={activity.totals.currency} />
          <Metric label={t('outstandingGross')} amount={activity.totals.outstandingGross} currency={activity.totals.currency} />
          <div>
            <dt className="text-xs text-[var(--pf-text-muted)]">{t('expenseCount')}</dt>
            <dd className="font-medium">{activity.totals.expenseCount}</dd>
          </div>
        </dl>

        {activity.derivedProjects.length > 0 ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('derivedProjects')}</h3>
            <ul className="flex flex-col gap-2 text-sm">
              {activity.derivedProjects.map((project) => (
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
                  <MoneyText value={money(project.recognizedNet, project.currency)} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('expensesTitle')}</h3>
          <ul className="flex flex-col gap-1 text-sm">
            {activity.expenses.map((row) => (
              <li
                key={row.id}
                className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
              >
                <Link href={`/expenses/${row.id}`} className={textNavLinkClassName}>
                  {row.description?.trim() || t('untitledExpense')}
                </Link>
                <span dir="ltr" className="text-xs text-[var(--pf-text-muted)]">
                  {formatBusinessDate(row.expenseDate, locale)}
                </span>
                <ExpenseKindBadge kind={row.kind} label={t(`kind.${row.kind}`)} />
                <ProjectSummary row={row} t={t} />
                <MoneyText value={money(row.netAmount, row.currency)} />
                <ExpenseStatusBadge status={row.status} label={t(`expenseStatus.${row.status}`)} />
                <PaymentStatusBadge row={row} t={t} />
              </li>
            ))}
          </ul>
        </section>
      </CardContent>
    </Card>
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
  readonly t: Awaited<ReturnType<typeof getTranslations<'vendors.financialActivity'>>>;
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
  readonly t: Awaited<ReturnType<typeof getTranslations<'vendors.financialActivity'>>>;
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
              {line.percent ? <span dir="ltr">{line.percent}%</span> : null}
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
