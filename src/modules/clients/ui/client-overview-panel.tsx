import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { ClientFinancialView } from '@/modules/clients/application/get-client-financials';
import type { ClientProfitabilitySnapshot } from '@/modules/clients/domain/client-profitability';
import { isPositiveMoney } from '@/shared/money';

function Stat({
  label,
  value,
}: {
  readonly label: string;
  readonly value: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
      <p className="text-xs text-[var(--pf-text-secondary)]">{label}</p>
      <p className="mt-1 break-words text-base font-semibold">{value}</p>
    </div>
  );
}

export async function ClientOverviewPanel({
  linkedProjectCount,
  openQuoteCount,
  contractCount,
  financials,
  profitability,
}: {
  readonly linkedProjectCount: number;
  readonly openQuoteCount: number;
  readonly contractCount: number;
  readonly financials: ClientFinancialView | null;
  readonly profitability: ClientProfitabilitySnapshot | null;
}) {
  const t = await getTranslations('clients.detail.overview');
  const snapshot = financials?.snapshot;
  const hasOverdue = (snapshot?.overdueCount ?? 0) > 0;

  return (
    <div className="flex flex-col gap-4">
      {hasOverdue && snapshot ? (
        <Alert tone="danger" title={t('needsAttention')}>
          {t('overdueSummary', { count: snapshot.overdueCount })}
        </Alert>
      ) : null}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base">{t('atAGlance')}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label={t('activeProjects')} value={linkedProjectCount} />
          <Stat label={t('contracts')} value={contractCount} />
          <Stat label={t('openQuotes')} value={openQuoteCount} />
          {snapshot?.hasBillingData ? (
            <>
              <Stat
                label={t('totalBilled')}
                value={<MoneyText value={snapshot.netInvoiced} colorizeNegative />}
              />
              <Stat label={t('collected')} value={<MoneyText value={snapshot.paid} />} />
              <Stat
                label={t('outstanding')}
                value={<MoneyText value={snapshot.outstanding} colorizeNegative />}
              />
              {isPositiveMoney(snapshot.overdue) ? (
                <Stat
                  label={t('overdue')}
                  value={<MoneyText value={snapshot.overdue} colorizeNegative />}
                />
              ) : null}
            </>
          ) : null}
          {profitability?.hasProjects && profitability.profit ? (
            <Stat
              label={t('currentProfit')}
              value={<MoneyText value={profitability.profit} colorizeNegative />}
            />
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
