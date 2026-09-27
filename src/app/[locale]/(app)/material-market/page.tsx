import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { PageHeader } from '@/components/ui/page-header';
import { loadMaterialMarketDashboard } from '@/modules/material-market';
import { TradePressureCard } from '@/modules/material-market/ui/trade-pressure-card';
import { withOrgContext } from '@/shared/auth/session';
import { getDb } from '@/shared/db/client';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { redirect } from '@/shared/i18n/navigation';

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: 'materialMarket' });
  return { title: t('title') };
}

export default async function MaterialMarketPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const [{ locale }, t] = await Promise.all([params, getTranslations('materialMarket')]);

  const allowed = await withOrgContext(async (context) =>
    hasPermission(context, PERMISSIONS.MATERIALS_READ),
  );
  if (!allowed) redirect({ href: '/', locale });

  const entries = await withOrgContext(async () => {
    const db = getDb();
    return loadMaterialMarketDashboard(db);
  });

  return (
    <div className="flex min-w-0 max-w-full flex-col gap-6">
      <PageHeader title={t('title')} description={t('description')} />
      <p className="rounded-lg border border-border bg-muted/40 px-4 py-3 text-sm text-muted-foreground">
        {t('disclaimer')}
      </p>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {entries.map(({ trade, snapshot }) => (
          <TradePressureCard
            key={trade}
            trade={trade}
            snapshot={snapshot}
            tradeLabel={t(`trades.${trade}`)}
            pendingTitle={t('pendingScore')}
            pendingDescription={t('pendingDescription')}
            directionLabel={
              snapshot ? t(`direction.${snapshot.pressureDirection}`) : t('direction.neutral')
            }
            confidenceLabel={
              snapshot ? t(`confidence.${snapshot.confidence}`) : t('confidence.low')
            }
            momentumLabel={
              snapshot ? t(`momentum.${snapshot.pressureMomentum}`) : t('momentum.stable')
            }
            localConfirmationLabel={
              snapshot
                ? t(`localConfirmation.${snapshot.localConfirmation}`)
                : t('localConfirmation.no_local_data')
            }
            driverLabel={(key) => t(`drivers.${key}`)}
            detailLabel={t('detailLink')}
            scoreLabel={t('scoreLabel')}
            lastUpdatedLabel={
              snapshot
                ? t('lastUpdated', { date: snapshot.snapshotDate.slice(0, 7) })
                : t('pendingLastUpdated')
            }
            monthChangeLabel={
              snapshot?.pressureScore1mChange != null
                ? t('monthChange', {
                    change: `${snapshot.pressureScore1mChange > 0 ? '+' : ''}${snapshot.pressureScore1mChange.toFixed(1)}`,
                  })
                : null
            }
          />
        ))}
      </div>
    </div>
  );
}
