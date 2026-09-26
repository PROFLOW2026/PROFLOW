import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { BillingNetPrimaryDisplay } from '@/components/patterns/billing-net-primary-display';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ClientFinancialView } from '@/modules/clients/application/get-client-financials';
import { BillingListTable } from '@/modules/billing/ui/billing-list-table';
import { PaymentHistoryTable } from '@/modules/billing/ui/payment-history-panel';
import { subtractMoney } from '@/shared/money';

interface ClientFinancialPanelProps {
  financials: ClientFinancialView;
  locale: string;
  billingRouteBase?: string;
}

export async function ClientFinancialPanel({
  financials,
  locale,
  billingRouteBase = '/billing',
}: ClientFinancialPanelProps) {
  const t = await getTranslations('clients.detail.financial');
  const tFinancial = await getTranslations('financial');
  const { snapshot, recentBilling, recentPayments, openBilling, overdueBilling } = financials;
  const hasOverdue = snapshot.overdueCount > 0;
  const billedVat = subtractMoney(snapshot.invoiced, snapshot.netInvoiced);

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="client-financial-heading">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle id="client-financial-heading">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          {hasOverdue ? (
            <Alert tone="danger" title={t('overdueBilling')}>
              {t('overdueBanner', { count: snapshot.overdueCount })}
            </Alert>
          ) : null}
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
              <p className="text-xs text-[var(--pf-text-secondary)]">{t('invoiced')}</p>
              <div className="mt-1">
                <BillingNetPrimaryDisplay
                  netAmount={snapshot.netInvoiced}
                  grossAmount={snapshot.invoiced}
                  netLabel={tFinancial('basis.billingNet')}
                  grossLabel={tFinancial('kpis.includingVat')}
                />
              </div>
            </div>
            <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
              <p className="text-xs text-[var(--pf-text-secondary)]">{tFinancial('kpis.billedVat')}</p>
              <p className="mt-1 break-words text-base font-semibold">
                <MoneyText value={billedVat} />
              </p>
            </div>
            <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
              <p className="text-xs text-[var(--pf-text-secondary)]">{t('invoicedGross')}</p>
              <p className="mt-1 break-words text-base font-semibold">
                <MoneyText value={snapshot.invoiced} />
              </p>
            </div>
            <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
              <p className="text-xs text-[var(--pf-text-secondary)]">{t('paid')}</p>
              <p className="mt-1 break-words text-base font-semibold">
                <MoneyText value={snapshot.paid} />
              </p>
            </div>
            <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
              <p className="text-xs text-[var(--pf-text-secondary)]">{t('balance')}</p>
              <p className="mt-0.5 text-[11px] text-[var(--pf-text-muted)]">{t('balanceHint')}</p>
              <p className="mt-1 break-words text-base font-semibold">
                <MoneyText value={snapshot.outstanding} colorizeNegative />
              </p>
            </div>
            <div
              className={
                hasOverdue
                  ? 'min-w-0 rounded-md border border-[var(--pf-status-danger-border)] bg-[var(--pf-status-danger-bg)] p-3 text-start text-[var(--pf-status-danger-fg)]'
                  : 'min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start'
              }
            >
              <p className="text-xs">{t('overdue')}</p>
              <p className="mt-1 break-words text-base font-semibold">
                <MoneyText value={snapshot.overdue} colorizeNegative />
              </p>
              <p className="text-xs">
                {t('overdueCount', { count: snapshot.overdueCount })}
              </p>
            </div>
          </div>
          {snapshot.heldRetention ? (
            <div className="min-w-0 rounded-md border border-dashed border-[var(--pf-border-default)] p-3 text-start">
              <p className="text-xs text-[var(--pf-text-secondary)]">{t('heldRetention')}</p>
              <p className="mt-1 break-words text-sm font-semibold">
                <MoneyText value={snapshot.heldRetention} />
              </p>
              <p className="mt-1 text-xs text-[var(--pf-text-secondary)]">{t('heldRetentionHint')}</p>
            </div>
          ) : null}
          {snapshot.excludedForeignCurrencyCount > 0 ? (
            <p className="text-start text-xs text-[var(--pf-text-secondary)]">
              {t('excludedForeign', { count: snapshot.excludedForeignCurrencyCount })}
            </p>
          ) : null}
          <p className="text-start text-xs text-[var(--pf-text-secondary)]">{t('integrityHint')}</p>
        </CardContent>
      </Card>

      {hasOverdue ? (
        <Card className="min-w-0 border-[var(--pf-status-danger-border)]">
          <CardHeader>
            <CardTitle>{t('overdueBilling')}</CardTitle>
            <CardDescription>{t('overdueBillingHint')}</CardDescription>
          </CardHeader>
          <CardContent className="min-w-0">
            <BillingListTable
              records={overdueBilling}
              locale={locale}
              routeBase={billingRouteBase}
            />
            {snapshot.overdueCount > overdueBilling.length ? (
              <p className="mt-2 text-start text-xs text-[var(--pf-text-secondary)]">
                {t('showingPartial', { shown: overdueBilling.length, count: snapshot.overdueCount })}
              </p>
            ) : null}
          </CardContent>
        </Card>
      ) : null}

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('openBilling')}</CardTitle>
          <CardDescription>{t('openBillingHint')}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {openBilling.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('openBillingEmpty')}</p>
          ) : (
            <BillingListTable records={openBilling} locale={locale} routeBase={billingRouteBase} />
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('recentBilling')}</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          {recentBilling.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('emptyBilling')}</p>
          ) : (
            <BillingListTable records={recentBilling} locale={locale} routeBase={billingRouteBase} />
          )}
        </CardContent>
      </Card>

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('recentPayments')}</CardTitle>
          <CardDescription>{t('paymentsHint')}</CardDescription>
        </CardHeader>
        <CardContent className="min-w-0">
          {recentPayments.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('emptyPayments')}</p>
          ) : (
            <PaymentHistoryTable rows={recentPayments} locale={locale} />
          )}
        </CardContent>
      </Card>
    </section>
  );
}
