import { CoverageDisclosure } from '@/components/patterns/coverage-disclosure';
import { MoneyText } from '@/components/patterns/money-text';
import type { ProjectFinancials } from '../domain/types';
import { mapCoverageToSources } from './map-coverage-sources';
import { resolveProjectKpiDisplay } from './resolve-kpi-display';

export interface ProjectFinancialsSnapshotViewProps {
  readonly financials: ProjectFinancials;
  readonly canReadProfit: boolean;
  readonly t: (key: string) => string;
}

export function ProjectFinancialsSnapshotView({
  financials,
  canReadProfit,
  t,
}: ProjectFinancialsSnapshotViewProps) {
  const coverageSources = mapCoverageToSources(financials.coverage, t);
  const showCoverage =
    coverageSources.some((source) => source.included || source.note) ||
    (financials.coverage.partials?.length ?? 0) > 0;
  const kpis = resolveProjectKpiDisplay(financials);

  const displayOriginal = financials.commercial?.displayOriginalContractValue ?? null;
  const openingReduction = financials.commercial?.openingReductionValue ?? null;

  return (
    <>
      {displayOriginal ? (
        <div className="flex justify-between gap-2" data-testid="display-original-snapshot">
          <span className="text-[var(--pf-text-muted)]">{t('displayOriginalContractValue')}</span>
          <MoneyText value={displayOriginal} className="text-[var(--pf-text-muted)]" />
        </div>
      ) : null}
      {openingReduction ? (
        <div className="flex justify-between gap-2" data-testid="opening-reduction-snapshot">
          <span className="text-[var(--pf-text-muted)]">{t('openingReductionValue')}</span>
          <MoneyText value={openingReduction} className="text-[var(--pf-text-muted)]" />
        </div>
      ) : null}
      {kpis.currentContract ? (
        <div className="flex justify-between gap-2">
          <span className="text-[var(--pf-text-secondary)]">{t('kpis.currentContract')}</span>
          <MoneyText value={kpis.currentContract} />
        </div>
      ) : null}
      <div className="flex justify-between gap-2">
        <span className="text-[var(--pf-text-secondary)]">{t('kpis.actualCost')}</span>
        <MoneyText value={kpis.actualCost} />
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-[var(--pf-text-secondary)]">{t('kpis.allocatedOverhead')}</span>
        <MoneyText value={kpis.allocatedOverhead} />
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-[var(--pf-text-secondary)]">{t('kpis.committed')}</span>
        <MoneyText value={kpis.committed} />
      </div>
      {canReadProfit && kpis.priceNotSet ? (
        <p className="text-[var(--pf-text-secondary)]" data-testid="price-not-set-snapshot">
          {t('kpis.priceNotSet')}
        </p>
      ) : null}
      {canReadProfit && !kpis.priceNotSet && kpis.actualMargin ? (
        <div className="flex justify-between gap-2">
          <span className="text-[var(--pf-text-secondary)]">{t('kpis.actualMargin')}</span>
          <MoneyText value={kpis.actualMargin} />
        </div>
      ) : null}
      {canReadProfit && !kpis.priceNotSet && kpis.forecastMargin ? (
        <div className="flex justify-between gap-2">
          <span className="text-[var(--pf-text-secondary)]">{t('kpis.forecastMargin')}</span>
          <MoneyText value={kpis.forecastMargin} />
        </div>
      ) : null}
      {showCoverage ? <CoverageDisclosure sources={coverageSources} /> : null}
    </>
  );
}
