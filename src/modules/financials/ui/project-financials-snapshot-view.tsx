import { CoverageDisclosure } from '@/components/patterns/coverage-disclosure';
import { MoneyText } from '@/components/patterns/money-text';
import type { ProjectFinancials } from '../domain/types';
import { mapCoverageToSources } from './map-coverage-sources';

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

  return (
    <>
      <div className="flex justify-between gap-2">
        <span className="text-[var(--pf-text-secondary)]">{t('actualCostToDate')}</span>
        <MoneyText value={financials.cost.actualCostToDate} />
      </div>
      {canReadProfit && financials.commercial && financials.profit ? (
        <div className="flex justify-between gap-2">
          <span className="text-[var(--pf-text-secondary)]">{t('estimatedProfit')}</span>
          <MoneyText value={financials.profit.estimatedProfit} />
        </div>
      ) : null}
      {showCoverage ? <CoverageDisclosure sources={coverageSources} /> : null}
    </>
  );
}
