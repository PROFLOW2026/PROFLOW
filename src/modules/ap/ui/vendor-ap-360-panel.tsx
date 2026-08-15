import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatusBadge, type StatusShape } from '@/components/ui/status-badge';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type {
  ApPaymentRow,
  ApVendorCreditListView,
  BillPayableSummary,
  OrgApPayablesSummary,
  PayablesAging,
} from '@/modules/ap';
import { addMoney, money, zeroMoney } from '@/shared/money';
import { Link } from '@/shared/i18n/navigation';
import { cn } from '@/shared/ui/cn';

function billStatusShape(status: string): StatusShape {
  switch (status) {
    case 'draft':
      return 'draft';
    case 'open':
      return 'active';
    case 'partially_matched':
      return 'pending';
    case 'matched':
      return 'completed';
    case 'void':
      return 'cancelled';
    default:
      return 'archived';
  }
}

export interface VendorAp360PanelProps {
  readonly canRead: boolean;
  readonly outstanding: OrgApPayablesSummary | null;
  readonly aging: PayablesAging | null;
  readonly credits: readonly ApVendorCreditListView[];
  readonly payments: readonly ApPaymentRow[];
  readonly linkedProjects: readonly { id: string; name: string }[];
}

export async function VendorAp360Panel({
  canRead,
  outstanding,
  aging,
  credits,
  payments,
  linkedProjects,
}: VendorAp360PanelProps) {
  const t = await getTranslations('vendors.ap360');
  const tAp = await getTranslations('ap');

  if (!canRead) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t('title')}</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-[var(--pf-text-secondary)]">{t('noAccess')}</p>
        </CardContent>
      </Card>
    );
  }

  if (!outstanding) return null;

  const creditedTotal = outstanding.bills.reduce(
    (sum, bill) => addMoney(sum, money(bill.credited, bill.currency)),
    zeroMoney(outstanding.currency),
  );

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('title')}</CardTitle>
        <p className="text-sm text-[var(--pf-text-secondary)]">{t('description')}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-5">
          <Kpi label={t('billed')} amount={outstanding.billed} currency={outstanding.currency} />
          <Kpi label={t('paid')} amount={outstanding.paid} currency={outstanding.currency} />
          <Kpi
            label={t('outstanding')}
            amount={outstanding.outstanding}
            currency={outstanding.currency}
          />
          <Kpi
            label={t('credits')}
            amount={creditedTotal.amount}
            currency={outstanding.currency}
          />
          <Kpi
            label={t('retentionHeld')}
            amount={outstanding.retentionHeld}
            currency={outstanding.currency}
          />
        </dl>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('linkedProjects')}</h3>
          {linkedProjects.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('linkedProjectsEmpty')}</p>
          ) : (
            <ul className="flex flex-wrap gap-2">
              {linkedProjects.map((project) => (
                <li key={project.id}>
                  <Link href={`/projects/${project.id}`} className={textNavLinkClassName}>
                    {project.name}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {aging ? (
          <section className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold">{t('agingTitle')}</h3>
            <ul className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-5">
              {aging.buckets.map((bucket) => (
                <li
                  key={bucket.key}
                  className="rounded-md border border-[var(--pf-border-default)] p-2"
                >
                  <p className="text-xs text-[var(--pf-text-muted)]">
                    {tAp(`aging.buckets.${bucket.key}`)}
                  </p>
                  <MoneyText value={bucket.total} />
                  <p className="text-xs text-[var(--pf-text-muted)]">
                    {tAp('aging.count', { count: bucket.count })}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <BillList
          bills={outstanding.bills}
          emptyLabel={t('billsEmpty')}
          title={t('billsTitle')}
          outstandingLabel={t('outstanding')}
          formatStatus={(status) => tAp(`statuses.${status}`)}
        />

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('paymentsTitle')}</h3>
          {payments.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('paymentsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
                >
                  <span dir="ltr">{payment.paymentDate}</span>
                  <MoneyText value={money(payment.amount, payment.currency)} />
                  <StatusBadge
                    shape={payment.status === 'void' ? 'cancelled' : 'completed'}
                    label={tAp(`payments.statuses.${payment.status}`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">{t('creditsTitle')}</h3>
          {credits.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('creditsEmpty')}</p>
          ) : (
            <ul className="flex flex-col gap-1 text-sm">
              {credits.map((credit) => (
                <li
                  key={credit.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
                >
                  <Link
                    href={`/procurement/ap/credits/${credit.id}`}
                    className={cn(textNavLinkClassName, 'min-w-0 truncate')}
                  >
                    {credit.reference || credit.id.slice(0, 8)}
                  </Link>
                  <MoneyText value={money(credit.amount, credit.currency)} />
                  <StatusBadge
                    shape={credit.displayStatus === 'void' ? 'cancelled' : 'active'}
                    label={tAp(`credits.statuses.${credit.displayStatus}`)}
                  />
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}

function Kpi({
  label,
  amount,
  currency,
}: {
  readonly label: string;
  readonly amount: string;
  readonly currency: string;
}) {
  return (
    <div className="text-start">
      <dt className="text-xs text-[var(--pf-text-muted)]">{label}</dt>
      <dd>
        <MoneyText value={money(amount, currency)} />
      </dd>
    </div>
  );
}

function BillList({
  bills,
  emptyLabel,
  title,
  outstandingLabel,
  formatStatus,
}: {
  readonly bills: readonly BillPayableSummary[];
  readonly emptyLabel: string;
  readonly title: string;
  readonly outstandingLabel: string;
  readonly formatStatus: (status: string) => string;
}) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="text-sm font-semibold">{title}</h3>
      {bills.length === 0 ? (
        <p className="text-sm text-[var(--pf-text-secondary)]">{emptyLabel}</p>
      ) : (
        <ul className="flex flex-col gap-1 text-sm">
          {bills.map((bill) => (
            <li
              key={bill.billId}
              className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--pf-border-default)] px-3 py-2"
            >
              <Link
                href={`/procurement/ap/${bill.billId}`}
                className={cn(textNavLinkClassName, 'min-w-0')}
              >
                {bill.reference || bill.billId.slice(0, 8)}
              </Link>
              <StatusBadge shape={billStatusShape(bill.billStatus)} label={formatStatus(bill.billStatus)} />
              <MoneyText value={money(bill.billTotal, bill.currency)} />
              <span className="text-xs text-[var(--pf-text-muted)]">
                {outstandingLabel}: <MoneyText value={money(bill.outstanding, bill.currency)} />
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
