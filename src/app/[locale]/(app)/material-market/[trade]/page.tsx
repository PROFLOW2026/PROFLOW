import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { loadTradeDetail, MATERIAL_TRADES, type MaterialTrade } from '@/modules/material-market';
import { TradeDetailPanel } from '@/modules/material-market/ui/trade-detail-panel';
import { TradePendingPanel } from '@/modules/material-market/ui/trade-pending-panel';
import { withOrgContext } from '@/shared/auth/session';
import { Link, redirect } from '@/shared/i18n/navigation';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';

function parseTrade(value: string): MaterialTrade | null {
  return (MATERIAL_TRADES as readonly string[]).includes(value) ? (value as MaterialTrade) : null;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; trade: string }>;
}): Promise<Metadata> {
  const { locale, trade: tradeParam } = await params;
  const trade = parseTrade(tradeParam);
  const t = await getTranslations({ locale, namespace: 'materialMarket' });
  if (!trade) return { title: t('title') };
  return { title: `${t(`trades.${trade}`)} — ${t('title')}` };
}

export default async function MaterialMarketTradePage({
  params,
}: {
  params: Promise<{ locale: string; trade: string }>;
}) {
  const { locale, trade: tradeParam } = await params;
  const trade = parseTrade(tradeParam);
  if (!trade) notFound();

  const t = await getTranslations('materialMarket');

  const detail = await withOrgContext(async (context) => {
    if (!hasPermission(context, PERMISSIONS.MATERIALS_READ)) {
      redirect({ href: '/', locale });
    }
    return loadTradeDetail(context.db, trade, 'all');
  });

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader
        title={t(`trades.${trade}`)}
        description={t('description')}
        actions={
          <Link href="/material-market" className="text-sm font-medium text-primary underline-offset-4 hover:underline">
            ← {t('title')}
          </Link>
        }
      />
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {t('disclaimer')}
      </p>
      {detail ? (
        <TradeDetailPanel detail={detail} />
      ) : (
        <TradePendingPanel
          tradeLabel={t(`trades.${trade}`)}
          pendingTitle={t('pendingScore')}
          pendingDescription={t('pendingDescription')}
        />
      )}
    </div>
  );
}
