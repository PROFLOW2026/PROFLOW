import { getTranslations } from 'next-intl/server';
import { Link } from '@/shared/i18n/navigation';
import { Button } from '@/components/ui/button';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type { AllCapabilitiesCardSupplement } from '@/modules/tenancy/domain/experience-dashboard-layout';
import type { HomeDashboardData } from '../application/get-home-dashboard';
import { DashboardKpiCard } from './dashboard-kpi-card';

export async function HomeDashboardCardSupplements({
  data,
  cards,
}: {
  data: HomeDashboardData;
  cards: readonly AllCapabilitiesCardSupplement[];
}) {
  const [t, tNav] = await Promise.all([
    getTranslations('dashboard'),
    getTranslations('nav'),
  ]);

  return (
    <div className="flex min-w-0 flex-col gap-6">
      {cards.map((card) => {
        switch (card) {
          case 'serviceToday':
            return (
              <section key={card} className="min-w-0 max-w-full">
                <h2 className="mb-2 text-sm font-semibold">{t('cards.serviceToday.title')}</h2>
                <p className="text-sm text-[var(--pf-text-secondary)]">
                  {data.preferServiceSurface
                    ? t('cards.serviceToday.bodyService')
                    : t('cards.serviceToday.body')}
                </p>
                <p className="mt-2">
                  <Link href="/today" className={textNavLinkClassName} prefetch={false}>
                    {t('attention.linkToday')}
                  </Link>
                </p>
              </section>
            );
          case 'timeUtilization':
            return (
              <section key={card} className="min-w-0 max-w-full">
                <h2 className="mb-2 text-sm font-semibold">{t('cards.timeUtilization.title')}</h2>
                <p className="mb-3 text-sm text-[var(--pf-text-secondary)]">
                  {t('cards.timeUtilization.body')}
                </p>
                <div className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2">
                  {data.activeProjectCount > 0 ? (
                    <DashboardKpiCard
                      title={t('activeProjects')}
                      value={String(data.activeProjectCount)}
                    />
                  ) : null}
                  {data.attention.pendingChangesCount +
                    data.attention.unbilledApprovedCount +
                    data.attention.overdueBillingCount >
                  0 ? (
                    <DashboardKpiCard
                      title={t('attention.title')}
                      value={String(
                        data.attention.pendingChangesCount +
                          data.attention.unbilledApprovedCount +
                          data.attention.overdueBillingCount,
                      )}
                    />
                  ) : null}
                </div>
                <p className="mt-2">
                  <Link href="/workforce/time" className={textNavLinkClassName} prefetch={false}>
                    {tNav('time')}
                  </Link>
                </p>
              </section>
            );
          case 'quotePipeline':
            if (!data.showQuotes) return null;
            return (
              <section key={card} className="min-w-0 max-w-full">
                <h2 className="mb-2 text-sm font-semibold">{t('cards.quotePipeline.title')}</h2>
                <p className="mb-2 text-sm text-[var(--pf-text-secondary)]">
                  {t('cards.quotePipeline.body')}
                </p>
                <Link href="/quotes" className={textNavLinkClassName} prefetch={false}>
                  {tNav('quotes')}
                </Link>
              </section>
            );
          case 'firstActions':
            return (
              <section key={card} className="min-w-0 max-w-full">
                <h2 className="mb-3 text-sm font-semibold">{t('quickActions')}</h2>
                <div className="flex min-w-0 max-w-full flex-wrap gap-2">
                  {data.canCreateProject ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link
                        href={
                          data.emptyStartKind === 'work_order'
                            ? '/work-orders/new'
                            : data.emptyStartKind === 'job'
                              ? '/jobs/new'
                              : '/projects/new'
                        }
                        prefetch={false}
                      >
                        {data.emptyStartKind === 'work_order'
                          ? tNav('newMenu.service')
                          : data.emptyStartKind === 'job'
                            ? tNav('newMenu.job')
                            : tNav('newMenu.project')}
                      </Link>
                    </Button>
                  ) : null}
                  {data.canCreateExpense ? (
                    <Button asChild size="sm" variant="secondary">
                      <Link href="/expenses/new" prefetch={false}>
                        {tNav('newMenu.expense')}
                      </Link>
                    </Button>
                  ) : null}
                </div>
              </section>
            );
          default:
            return null;
        }
      })}
    </div>
  );
}
