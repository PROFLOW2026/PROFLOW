import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Alert } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import { cn } from '@/shared/ui/cn';
import type { ClientFinancialView } from '@/modules/clients/application/get-client-financials';
import type { ClientProfitabilitySnapshot } from '@/modules/clients/domain/client-profitability';
import { clientDetailTabHref } from './client-detail-tab-order';

function Stat({
  label,
  children,
}: {
  readonly label: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
      <p className="text-xs text-[var(--pf-text-secondary)]">{label}</p>
      <p className="mt-1 break-words text-base font-semibold">{children}</p>
    </div>
  );
}

export async function ClientOverviewPanel({
  clientId,
  linkedProjectCount,
  openQuoteCount,
  financials,
  profitability,
}: {
  readonly clientId: string;
  readonly linkedProjectCount: number;
  readonly openQuoteCount: number;
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
        <CardHeader>
          <CardTitle className="text-base">{t('atAGlance')}</CardTitle>
        </CardHeader>
        <CardContent className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <Stat label={t('activeProjects')}>{linkedProjectCount}</Stat>
          <Stat label={t('openQuotes')}>{openQuoteCount}</Stat>
          {snapshot ? (
            <>
              <Stat label={t('outstanding')}>
                <MoneyText value={snapshot.outstanding} colorizeNegative />
              </Stat>
              <Stat label={t('collected')}>
                <MoneyText value={snapshot.paid} />
              </Stat>
            </>
          ) : null}
          {profitability?.hasProjects && profitability.profit ? (
            <Stat label={t('currentProfit')}>
              <MoneyText value={profitability.profit} colorizeNegative />
            </Stat>
          ) : null}
        </CardContent>
      </Card>

      <p className="text-sm text-[var(--pf-text-secondary)]">{t('exploreHint')}</p>

      <ul className="flex flex-wrap gap-3 text-sm">
        {(
          [
            ['projects', t('goProjects')],
            ['money', t('goMoney')],
            ['sales', t('goSales')],
            ['documents', t('goDocuments')],
            ['activity', t('goActivity')],
            ['details', t('goDetails')],
          ] as const
        ).map(([tab, label]) => (
          <li key={tab}>
            <Link
              href={clientDetailTabHref(clientId, tab)}
              className={cn(textNavLinkClassName, 'font-medium')}
            >
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
