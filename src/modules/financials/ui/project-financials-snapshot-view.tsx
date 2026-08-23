import { CoverageDisclosure } from '@/components/patterns/coverage-disclosure';
import { MoneyText } from '@/components/patterns/money-text';
import type { ProjectFinancials } from '../domain/types';
import type { ProjectKpiAvailability } from '../domain/financial-slice-availability';
import { mapCoverageToSources } from './map-coverage-sources';
import { resolveProjectKpiDisplay } from './resolve-kpi-display';

export interface ProjectFinancialsSnapshotViewProps {
  readonly financials: ProjectFinancials;
  readonly canReadProfit: boolean;
  readonly t: (key: string) => string;
}

function SnapshotMoneyRow({
  label,
  value,
  availability = 'value',
  unavailableLabel,
  partialLabel,
}: {
  label: string;
  value: { amount: string; currency: string };
  availability?: ProjectKpiAvailability;
  unavailableLabel: string;
  partialLabel: string;
}) {
  return (
    <div className="flex justify-between gap-2">
      <span className="text-[var(--pf-text-secondary)]">{label}</span>
      {availability === 'unavailable' ? (
        <span className="text-[var(--pf-text-muted)]">{unavailableLabel}</span>
      ) : availability === 'partial' ? (
        <span className="flex flex-col items-end gap-0.5">
          <MoneyText value={value} />
          <span className="text-xs text-[var(--pf-text-muted)]">{partialLabel}</span>
        </span>
      ) : (
        <MoneyText value={value} />
      )}
    </div>
  );
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
  const kpi = financials.kpiAvailability;

  const unavailableLabel = t('kpis.unavailable');
  const partialLabel = t('kpis.partial');

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
      <SnapshotMoneyRow
        label={t('kpis.actualCost')}
        value={kpis.actualCost}
        availability={kpi?.actualCost}
        unavailableLabel={unavailableLabel}
        partialLabel={partialLabel}
      />
      <SnapshotMoneyRow
        label={t('kpis.forecast')}
        value={kpis.forecastCost}
        availability={kpi?.forecastCost}
        unavailableLabel={unavailableLabel}
        partialLabel={partialLabel}
      />
      <SnapshotMoneyRow
        label={t('kpis.committed')}
        value={kpis.committed}
        availability={kpi?.committed}
        unavailableLabel={unavailableLabel}
        partialLabel={partialLabel}
      />
      {financials.billing.hasBillingData ? (
        <>
          <div className="flex justify-between gap-2">
            <span className="text-[var(--pf-text-secondary)]">{t('kpis.billed')}</span>
            <MoneyText value={kpis.billed} />
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[var(--pf-text-secondary)]">{t('kpis.paid')}</span>
            <MoneyText value={kpis.paid} />
          </div>
          <div className="flex justify-between gap-2">
            <span className="text-[var(--pf-text-secondary)]">{t('kpis.outstanding')}</span>
            <MoneyText value={kpis.outstanding} />
          </div>
        </>
      ) : kpi?.billing === 'unavailable' ? null : (
        <p className="text-xs text-[var(--pf-text-muted)]" data-testid="billing-not-setup">
          {t('kpis.billingNotSetup')}
        </p>
      )}
      {canReadProfit && kpis.priceNotSet ? (
        <p className="text-[var(--pf-text-secondary)]" data-testid="price-not-set-snapshot">
          {t('kpis.priceNotSet')}
        </p>
      ) : null}
      {canReadProfit &&
      !kpis.priceNotSet &&
      kpi?.actualProfit !== 'unavailable' &&
      kpis.actualMargin ? (
        <SnapshotMoneyRow
          label={t('kpis.actualMargin')}
          value={kpis.actualMargin}
          availability={kpi?.actualProfit}
          unavailableLabel={unavailableLabel}
          partialLabel={partialLabel}
        />
      ) : canReadProfit && !kpis.priceNotSet && kpi?.actualProfit === 'unavailable' ? (
        <div className="flex justify-between gap-2">
          <span className="text-[var(--pf-text-secondary)]">{t('kpis.actualMargin')}</span>
          <span className="text-[var(--pf-text-muted)]">{unavailableLabel}</span>
        </div>
      ) : null}
      {canReadProfit &&
      !kpis.priceNotSet &&
      kpi?.forecastProfit !== 'unavailable' &&
      kpis.forecastMargin ? (
        <SnapshotMoneyRow
          label={t('kpis.forecastMargin')}
          value={kpis.forecastMargin}
          availability={kpi?.forecastProfit}
          unavailableLabel={unavailableLabel}
          partialLabel={partialLabel}
        />
      ) : null}
      {showCoverage ? <CoverageDisclosure sources={coverageSources} /> : null}
    </>
  );
}
