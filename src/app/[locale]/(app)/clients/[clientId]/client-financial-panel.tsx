import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ClientFinancialView } from '@/modules/clients/application/get-client-financials';
import { BillingListTable } from '@/modules/billing/ui/billing-list-table';
import { PaymentHistoryTable } from '@/modules/billing/ui/payment-history-panel';

interface ClientFinancialPanelProps {
  financials: ClientFinancialView;
  locale: string;
}

export async function ClientFinancialPanel({ financials, locale }: ClientFinancialPanelProps) {
  const t = await getTranslations('clients.detail.financial');
  const { snapshot, recentBilling, recentPayments } = financials;

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="client-financial-heading">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle id="client-financial-heading">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
              <p className="text-xs text-[var(--pf-text-secondary)]">{t('invoiced')}</p>
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
              <p className="text-xs text-[var(--pf-text-secondary)]">{t('outstanding')}</p>
              <p className="mt-1 break-words text-base font-semibold">
                <MoneyText value={snapshot.outstanding} colorizeNegative />
              </p>
            </div>
            <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
              <p className="text-xs text-[var(--pf-text-secondary)]">{t('overdue')}</p>
              <p className="mt-1 break-words text-base font-semibold">
                <MoneyText value={snapshot.overdue} colorizeNegative />
              </p>
              <p className="text-xs text-[var(--pf-text-secondary)]">
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

      <Card className="min-w-0">
        <CardHeader>
          <CardTitle>{t('recentBilling')}</CardTitle>
        </CardHeader>
        <CardContent className="min-w-0">
          {recentBilling.length === 0 ? (
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('emptyBilling')}</p>
          ) : (
            <BillingListTable records={recentBilling} locale={locale} />
          )}
        </CardContent>
      </Card>

      {recentPayments.length > 0 ? (
        <Card className="min-w-0">
          <CardHeader>
            <CardTitle>{t('recentPayments')}</CardTitle>
          </CardHeader>
          <CardContent className="min-w-0">
            <PaymentHistoryTable rows={recentPayments} locale={locale} />
          </CardContent>
        </Card>
      ) : null}
    </section>
  );
}
