import {
  MainAppSection,
  MainAppSummaryGrid,
  MainAppSummaryItem,
} from '@/components/patterns/main-app';
import { CoverageDisclosure } from '@/components/patterns/coverage-disclosure';
import { MoneyText } from '@/components/patterns/money-text';
import { BillingNetPrimaryDisplay } from '@/components/patterns/billing-net-primary-display';
import type { ProjectFinancials } from '../domain/types';
import type { ProjectKpiAvailability } from '../domain/financial-slice-availability';
import { mapCoverageToSources } from './map-coverage-sources';
import { resolveProjectKpiDisplay } from './resolve-kpi-display';

export interface ProjectFinancialsSnapshotViewProps {
  readonly financials: ProjectFinancials;
  readonly canReadProfit: boolean;
  readonly t: (key: string) => string;
}

function SnapshotMoneyItem({
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
    <MainAppSummaryItem label={label}>
      {availability === 'unavailable' ? (
        <span className="text-[var(--pf-text-muted)]">{unavailableLabel}</span>
      ) : availability === 'partial' ? (
        <span className="flex flex-col items-start gap-0.5">
          <MoneyText value={value} />
          <span className="text-xs text-[var(--pf-text-muted)]">{partialLabel}</span>
        </span>
      ) : (
        <MoneyText value={value} />
      )}
    </MainAppSummaryItem>
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
    <MainAppSection className="text-start">
      <MainAppSummaryGrid className="min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {displayOriginal ? (
          <div data-testid="display-original-snapshot">
            <MainAppSummaryItem label={t('displayOriginalContractValue')}>
              <MoneyText value={displayOriginal} className="text-[var(--pf-text-muted)]" />
            </MainAppSummaryItem>
          </div>
        ) : null}
        {openingReduction ? (
          <div data-testid="opening-reduction-snapshot">
            <MainAppSummaryItem label={t('openingReductionValue')}>
              <MoneyText value={openingReduction} className="text-[var(--pf-text-muted)]" />
            </MainAppSummaryItem>
          </div>
        ) : null}
        {kpis.currentContract ? (
          <MainAppSummaryItem label={t('kpis.currentContract')}>
            <MoneyText value={kpis.currentContract} />
          </MainAppSummaryItem>
        ) : null}
        <SnapshotMoneyItem
          label={t('kpis.actualCost')}
          value={kpis.actualCost}
          availability={kpi?.actualCost}
          unavailableLabel={unavailableLabel}
          partialLabel={partialLabel}
        />
        <SnapshotMoneyItem
          label={t('kpis.forecast')}
          value={kpis.forecastCost}
          availability={kpi?.forecastCost}
          unavailableLabel={unavailableLabel}
          partialLabel={partialLabel}
        />
        <SnapshotMoneyItem
          label={t('kpis.committed')}
          value={kpis.committed}
          availability={kpi?.committed}
          unavailableLabel={unavailableLabel}
          partialLabel={partialLabel}
        />
        {financials.billing.hasBillingData ? (
          <>
            <MainAppSummaryItem label={t('kpis.billed')}>
              <BillingNetPrimaryDisplay
                netAmount={kpis.billed}
                grossAmount={kpis.billedGross}
                netLabel={t('basis.billingNet')}
                grossLabel={t('kpis.includingVat')}
                className="items-start text-start"
              />
            </MainAppSummaryItem>
            <MainAppSummaryItem label={t('kpis.paid')}>
              <MoneyText value={kpis.paid} />
            </MainAppSummaryItem>
            <MainAppSummaryItem label={t('kpis.outstanding')}>
              <MoneyText value={kpis.outstanding} />
            </MainAppSummaryItem>
          </>
        ) : null}
        {canReadProfit && kpis.priceNotSet ? (
          <div className="min-w-0 sm:col-span-2 lg:col-span-3" data-testid="price-not-set-snapshot">
            <p className="text-sm text-[var(--pf-text-secondary)]">{t('kpis.priceNotSet')}</p>
          </div>
        ) : null}
        {canReadProfit &&
        !kpis.priceNotSet &&
        kpi?.actualProfit !== 'unavailable' &&
        kpis.actualMargin ? (
          <SnapshotMoneyItem
            label={t('kpis.actualMargin')}
            value={kpis.actualMargin}
            availability={kpi?.actualProfit}
            unavailableLabel={unavailableLabel}
            partialLabel={partialLabel}
          />
        ) : canReadProfit && !kpis.priceNotSet && kpi?.actualProfit === 'unavailable' ? (
          <MainAppSummaryItem label={t('kpis.actualMargin')}>
            <span className="text-[var(--pf-text-muted)]">{unavailableLabel}</span>
          </MainAppSummaryItem>
        ) : null}
        {canReadProfit &&
        !kpis.priceNotSet &&
        kpi?.forecastProfit !== 'unavailable' &&
        kpis.forecastMargin ? (
          <SnapshotMoneyItem
            label={t('kpis.forecastMargin')}
            value={kpis.forecastMargin}
            availability={kpi?.forecastProfit}
            unavailableLabel={unavailableLabel}
            partialLabel={partialLabel}
          />
        ) : null}
      </MainAppSummaryGrid>
      {!financials.billing.hasBillingData && kpi?.billing !== 'unavailable' ? (
        <p className="mt-3 text-xs text-[var(--pf-text-muted)]" data-testid="billing-not-setup">
          {t('kpis.billingNotSetup')}
        </p>
      ) : null}
      {showCoverage ? (
        <div className="mt-3">
          <CoverageDisclosure sources={coverageSources} />
        </div>
      ) : null}
    </MainAppSection>
  );
}
