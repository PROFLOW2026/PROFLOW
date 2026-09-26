import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { loadTradeDetail, MATERIAL_TRADES, type MaterialTrade } from '@/modules/material-market';
import { TradeDetailPanel } from '@/modules/material-market/ui/trade-detail-panel';
import { withOrgContext } from '@/shared/auth/session';
import { getDb } from '@/shared/db/client';
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

  const allowed = await withOrgContext(async (context) =>
    hasPermission(context, PERMISSIONS.MATERIALS_READ),
  );
  if (!allowed) redirect({ href: '/', locale });

  const detail = await withOrgContext(async () => {
    const db = getDb();
    return loadTradeDetail(db, trade, 'all');
  });

  if (!detail) notFound();

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
      <TradeDetailPanel detail={detail} />
    </div>
  );
}
