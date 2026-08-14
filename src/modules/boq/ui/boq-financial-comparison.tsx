import { getTranslations } from 'next-intl/server';
import { MoneyText } from '@/components/patterns/money-text';
import type { BoqFinancialComparison } from '../application/compare-boq-financials';

export interface BoqFinancialComparisonStripProps {
  readonly comparison: BoqFinancialComparison;
}

/**
 * Contextual strip: physical progress beside engine Actual / Forecast.
 *
 * Progress ≠ Actual. Values below marked Actual/Forecast are READ from
 * getProjectFinancials — never invented from BOQ progress quantities.
 */
export async function BoqFinancialComparisonStrip({
  comparison,
}: BoqFinancialComparisonStripProps) {
  const t = await getTranslations('boq');

  return (
    <section className="flex min-w-0 flex-col gap-2 border-t border-[var(--pf-border-default)] pt-4">
      <div className="min-w-0 text-start">
        <h3 className="text-sm font-semibold">{t('comparison.title')}</h3>
        {/* Progress ≠ Actual — engine figures only */}
        <p className="text-xs text-[var(--pf-text-secondary)]">{t('comparison.progressNotActual')}</p>
      </div>
      <dl className="grid min-w-0 gap-2 sm:grid-cols-2 lg:grid-cols-3 text-sm">
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('comparison.physicalProgress')}</dt>
          <dd>
            {comparison.physicalProgressPercent != null
              ? `${comparison.physicalProgressPercent}%`
              : '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('comparison.actualCost')}</dt>
          <dd>
            {comparison.actualCostToDate ? (
              <MoneyText value={comparison.actualCostToDate} />
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('comparison.forecast')}</dt>
          <dd>
            {comparison.estimatedFinalCost ? (
              <MoneyText value={comparison.estimatedFinalCost} />
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('comparison.currentContract')}</dt>
          <dd>
            {comparison.currentContractValue ? (
              <MoneyText value={comparison.currentContractValue} />
            ) : (
              '—'
            )}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-[var(--pf-text-muted)]">{t('comparison.currentBoq')}</dt>
          <dd>
            {comparison.currentBoqAmount ? (
              <MoneyText value={comparison.currentBoqAmount} />
            ) : (
              '—'
            )}
          </dd>
        </div>
      </dl>
    </section>
  );
}
