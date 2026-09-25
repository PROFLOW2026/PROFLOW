import type { ReactNode } from 'react';
import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Link } from '@/shared/i18n/navigation';
import { textNavLinkClassName } from '@/components/ui/pressable';
import type { MoneyValue } from '@/shared/money';
import type { ClientProfitabilitySnapshot } from '../domain/client-profitability';

function MoneyOrDash({
  value,
  unavailable,
}: {
  readonly value: MoneyValue | null;
  readonly unavailable: string;
}) {
  if (!value) return <span className="text-[var(--pf-text-muted)]">{unavailable}</span>;
  return <MoneyText value={value} colorizeNegative />;
}

function Metric({
  label,
  hint,
  children,
}: {
  readonly label: string;
  readonly hint: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-md bg-[var(--pf-bg-muted)] p-3 text-start">
      <p className="text-xs text-[var(--pf-text-secondary)]">{label}</p>
      <p className="mt-0.5 text-[11px] text-[var(--pf-text-muted)]">{hint}</p>
      <p className="mt-1 break-words text-base font-semibold">{children}</p>
    </div>
  );
}

export async function ClientProfitabilityPanel({
  snapshot,
  projectsRouteBase = '/projects',
}: {
  readonly snapshot: ClientProfitabilitySnapshot;
  readonly projectsRouteBase?: string;
}) {
  const t = await getTranslations('clients.detail.profitability');
  const tFinancial = await getTranslations('financial');
  const unavailable = t('unavailable');

  return (
    <section className="flex min-w-0 flex-col gap-4" aria-labelledby="client-profitability-heading">
      <Card className="min-w-0">
        <CardHeader>
          <CardTitle id="client-profitability-heading">{t('title')}</CardTitle>
          <CardDescription>{t('subtitle')}</CardDescription>
        </CardHeader>
        <CardContent className="flex min-w-0 flex-col gap-4">
          <p className="text-start text-sm text-[var(--pf-text-secondary)]">{tFinancial('profitVsCash')}</p>
          {!snapshot.hasProjects ? (
            <p className="text-start text-sm text-[var(--pf-text-secondary)]">{t('empty')}</p>
          ) : (
            <>
              <div className="grid min-w-0 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                <Metric label={t('contract')} hint={t('contractHint')}>
                  <MoneyOrDash value={snapshot.currentContract} unavailable={unavailable} />
                </Metric>
                <Metric label={t('netBilled')} hint={t('netBilledHint')}>
                  <MoneyOrDash value={snapshot.netBilled} unavailable={unavailable} />
                </Metric>
                <Metric label={t('collected')} hint={t('collectedHint')}>
                  <MoneyOrDash value={snapshot.collected} unavailable={unavailable} />
                </Metric>
                <Metric label={t('openAr')} hint={t('openArHint')}>
                  <MoneyOrDash value={snapshot.openAr} unavailable={unavailable} />
                </Metric>
                <Metric label={t('directActual')} hint={t('directActualHint')}>
                  <MoneyOrDash value={snapshot.directActual} unavailable={unavailable} />
                </Metric>
                <Metric label={t('allocatedOverhead')} hint={t('allocatedOverheadHint')}>
                  <MoneyOrDash value={snapshot.allocatedOverhead} unavailable={unavailable} />
                </Metric>
                <Metric label={t('fullActual')} hint={t('fullActualHint')}>
                  <MoneyOrDash value={snapshot.fullActual} unavailable={unavailable} />
                </Metric>
                <Metric label={t('profit')} hint={t('profitHint')}>
                  <MoneyOrDash value={snapshot.profit} unavailable={unavailable} />
                </Metric>
                <Metric label={t('margin')} hint={t('marginHint')}>
                  {snapshot.marginPercent ? (
                    <span dir="ltr">{snapshot.marginPercent}%</span>
                  ) : (
                    <span className="text-[var(--pf-text-muted)]">{unavailable}</span>
                  )}
                </Metric>
              </div>
              {snapshot.priceNotSetCount > 0 ? (
                <p className="text-start text-xs text-[var(--pf-text-secondary)]">
                  {t('priceNotSet', { count: snapshot.priceNotSetCount })}
                </p>
              ) : null}
              {snapshot.excludedForeignCurrencyCount > 0 ? (
                <p className="text-start text-xs text-[var(--pf-text-secondary)]">
                  {t('excludedForeign', { count: snapshot.excludedForeignCurrencyCount })}
                </p>
              ) : null}
              {snapshot.mixedProfitabilityModes ? (
                <p className="text-start text-xs text-[var(--pf-text-secondary)]">{t('mixedModes')}</p>
              ) : null}
              {snapshot.profitIncomplete ? (
                <p className="text-start text-xs text-[var(--pf-text-secondary)]">{t('profitIncomplete')}</p>
              ) : null}
              <div className="flex min-w-0 flex-col gap-2">
                <h3 className="text-start text-sm font-semibold">{t('projects')}</h3>
                <ul className="flex list-none flex-col gap-2 p-0">
                  {snapshot.projects.map((project) => (
                    <li
                      key={project.projectId}
                      className="flex min-w-0 flex-col gap-1 rounded-md border border-[var(--pf-border-default)] p-3 text-start sm:flex-row sm:items-center sm:justify-between"
                    >
                      <Link
                        href={`${projectsRouteBase}/${project.projectId}?tab=financials`}
                        className={textNavLinkClassName}
                      >
                        {project.name}
                      </Link>
                      <div className="flex min-w-0 flex-col gap-0.5 text-sm sm:items-end">
                        {project.excludedForeignCurrency ? (
                          <span className="text-xs text-[var(--pf-text-muted)]">{t('otherCurrency')}</span>
                        ) : project.priceNotSet ? (
                          <span className="text-xs text-[var(--pf-text-muted)]">{t('priceNotSetRow')}</span>
                        ) : (
                          <>
                            <span>
                              {t('profit')}:{' '}
                              {project.profit ? (
                                <MoneyText value={project.profit} colorizeNegative />
                              ) : (
                                unavailable
                              )}
                            </span>
                            <span className="text-xs text-[var(--pf-text-secondary)]" dir="ltr">
                              {project.marginPercent ? `${project.marginPercent}%` : unavailable}
                            </span>
                          </>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
