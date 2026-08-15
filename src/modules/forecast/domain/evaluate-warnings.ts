import Decimal from 'decimal.js';
import type { EarlyWarning, EarlyWarningInput, EarlyWarningSeverity } from './types';

const THREE = new Decimal(3);
const FIFTEEN = new Decimal(15);
const FIFTY = new Decimal(50);
const SEVENTY = new Decimal(70);
const EIGHTY = new Decimal(80);

function dec(value: string | null | undefined): Decimal | null {
  if (value == null || value.trim() === '') return null;
  try {
    const parsed = new Decimal(value);
    if (!parsed.isFinite()) return null;
    return parsed;
  } catch {
    return null;
  }
}

function workHref(workKind: EarlyWarningInput['workKind'], projectId: string): string {
  if (workKind === 'job') return `/jobs/${projectId}?tab=financials`;
  if (workKind === 'work_order') return `/work-orders/${projectId}?tab=financials`;
  return `/projects/${projectId}?tab=financials`;
}

function driver(
  labelKey: string,
  amount: string | null,
  currency: string | null,
  percent: string | null = null,
) {
  return { labelKey, amount, currency, percent };
}

function worseSeverity(a: EarlyWarningSeverity, b: EarlyWarningSeverity): EarlyWarningSeverity {
  const rank = { critical: 2, warning: 1, info: 0 };
  return rank[a] >= rank[b] ? a : b;
}

/**
 * Deterministic early warnings from already-composed financial truth.
 * Thresholds are coarse on purpose — never fake precision.
 */
export function evaluateEarlyWarnings(input: EarlyWarningInput): EarlyWarning[] {
  const warnings: EarlyWarning[] = [];
  const href = workHref(input.workKind, input.projectId);
  const currency = input.currency;

  const actual = dec(input.actualCostAmount);
  const forecast = dec(input.forecastFinalCostAmount);
  const budget = input.canReadBudget ? dec(input.budgetAmount) : null;
  const committed = dec(input.committedOpenAmount);
  const etc = dec(input.expectedRemainingAmount);
  const contract = dec(input.currentContractAmount);
  const invoiced = input.canReadBilling ? dec(input.invoicedAmount) : null;
  const outstanding = input.canReadBilling ? dec(input.outstandingAmount) : null;
  const progress = dec(input.progressPercent);
  const actualMargin = input.canReadProfit ? dec(input.actualMarginPercent) : null;
  const forecastMargin = input.canReadProfit ? dec(input.forecastMarginPercent) : null;

  if (input.canReadBudget && budget && budget.greaterThan(0) && actual && actual.greaterThan(budget)) {
    warnings.push({
      kind: 'actual_over_budget',
      warningClass: 'confirmed',
      severity: 'critical',
      projectId: input.projectId,
      titleKey: 'actualOverBudget.title',
      whyKey: 'actualOverBudget.why',
      recommendationKey: 'actualOverBudget.recommendation',
      href,
      drivers: [
        driver('drivers.actual', actual.toFixed(2), currency),
        driver('drivers.budget', budget.toFixed(2), currency),
      ],
    });
  } else if (
    input.canReadBudget &&
    budget &&
    budget.greaterThan(0) &&
    forecast &&
    forecast.greaterThan(budget)
  ) {
    warnings.push({
      kind: 'projected_cost_over_budget',
      warningClass: 'projected',
      severity: 'warning',
      projectId: input.projectId,
      titleKey: 'projectedOverBudget.title',
      whyKey: 'projectedOverBudget.why',
      recommendationKey: 'projectedOverBudget.recommendation',
      href,
      drivers: [
        driver('drivers.forecast', forecast.toFixed(2), currency),
        driver('drivers.budget', budget.toFixed(2), currency),
        driver('drivers.actual', actual ? actual.toFixed(2) : null, currency),
      ],
    });
  }

  if (input.canReadBudget && budget && budget.greaterThan(0) && actual) {
    const remainingBudget = budget.minus(actual);
    const remainingNeed = (committed ?? new Decimal(0)).plus(etc ?? new Decimal(0));
    if (remainingBudget.greaterThan(0) && remainingNeed.greaterThan(remainingBudget)) {
      warnings.push({
        kind: 'insufficient_remaining_budget',
        warningClass: 'projected',
        severity: 'warning',
        projectId: input.projectId,
        titleKey: 'insufficientBudget.title',
        whyKey: 'insufficientBudget.why',
        recommendationKey: 'insufficientBudget.recommendation',
        href,
        drivers: [
          driver('drivers.remainingBudget', remainingBudget.toFixed(2), currency),
          driver('drivers.committed', committed ? committed.toFixed(2) : '0.00', currency),
          driver('drivers.etc', etc ? etc.toFixed(2) : '0.00', currency),
        ],
      });
    }
  }

  if (input.canReadProfit && !input.priceNotSet && forecastMargin && forecastMargin.lessThan(0)) {
    warnings.push({
      kind: 'forecast_margin_negative',
      warningClass: 'projected',
      severity: 'critical',
      projectId: input.projectId,
      titleKey: 'negativeForecastMargin.title',
      whyKey: 'negativeForecastMargin.why',
      recommendationKey: 'negativeForecastMargin.recommendation',
      href,
      drivers: [
        driver('drivers.forecastMargin', null, null, forecastMargin.toFixed(2)),
        driver('drivers.contract', contract ? contract.toFixed(2) : null, currency),
        driver('drivers.forecast', forecast ? forecast.toFixed(2) : null, currency),
      ],
    });
  }

  if (
    input.canReadProfit &&
    !input.priceNotSet &&
    actualMargin &&
    forecastMargin &&
    actualMargin.minus(forecastMargin).greaterThanOrEqualTo(THREE)
  ) {
    warnings.push({
      kind: 'margin_deterioration',
      warningClass: 'projected',
      severity: 'warning',
      projectId: input.projectId,
      titleKey: 'marginDeterioration.title',
      whyKey: 'marginDeterioration.why',
      recommendationKey: 'marginDeterioration.recommendation',
      href,
      drivers: [
        driver('drivers.actualMargin', null, null, actualMargin.toFixed(2)),
        driver('drivers.forecastMargin', null, null, forecastMargin.toFixed(2)),
      ],
    });
  }

  if (committed && committed.greaterThan(0) && input.canReadBudget && budget && budget.greaterThan(0) && actual) {
    const remainingBudget = budget.minus(actual);
    if (remainingBudget.greaterThan(0)) {
      const pressure = committed.dividedBy(remainingBudget).times(100);
      if (pressure.greaterThanOrEqualTo(EIGHTY)) {
        warnings.push({
          kind: 'commitment_pressure',
          warningClass: 'projected',
          severity: pressure.greaterThanOrEqualTo(new Decimal(100)) ? 'critical' : 'warning',
          projectId: input.projectId,
          titleKey: 'commitmentPressure.title',
          whyKey: 'commitmentPressure.why',
          recommendationKey: 'commitmentPressure.recommendation',
          href,
          drivers: [
            driver('drivers.committed', committed.toFixed(2), currency),
            driver('drivers.remainingBudget', remainingBudget.toFixed(2), currency),
            driver('drivers.pressurePercent', null, null, pressure.toDecimalPlaces(0).toFixed(0)),
          ],
        });
      }
    }
  }

  if (
    input.canReadBilling &&
    !input.priceNotSet &&
    contract &&
    contract.greaterThan(0) &&
    invoiced &&
    actual
  ) {
    const billedPct = invoiced.dividedBy(contract).times(100);
    const costPct = actual.dividedBy(contract).times(100);
    if (billedPct.lessThan(FIFTY) && costPct.greaterThanOrEqualTo(SEVENTY)) {
      warnings.push({
        kind: 'billing_lag',
        warningClass: 'confirmed',
        severity: 'warning',
        projectId: input.projectId,
        titleKey: 'billingLag.title',
        whyKey: 'billingLag.why',
        recommendationKey: 'billingLag.recommendation',
        href: workHref(input.workKind, input.projectId).replace('financials', 'billing'),
        drivers: [
          driver('drivers.invoiced', invoiced.toFixed(2), currency),
          driver('drivers.contract', contract.toFixed(2), currency),
          driver('drivers.actual', actual.toFixed(2), currency),
        ],
      });
    }
  }

  if (input.canReadBilling && invoiced && invoiced.greaterThan(0) && outstanding && outstanding.greaterThan(0)) {
    const share = outstanding.dividedBy(invoiced).times(100);
    if (share.greaterThanOrEqualTo(FIFTY)) {
      warnings.push({
        kind: 'collection_risk',
        warningClass: 'confirmed',
        severity: share.greaterThanOrEqualTo(SEVENTY) ? 'critical' : 'warning',
        projectId: input.projectId,
        titleKey: 'collectionRisk.title',
        whyKey: 'collectionRisk.why',
        recommendationKey: 'collectionRisk.recommendation',
        href: workHref(input.workKind, input.projectId).replace('financials', 'billing'),
        drivers: [
          driver('drivers.outstanding', outstanding.toFixed(2), currency),
          driver('drivers.invoiced', invoiced.toFixed(2), currency),
        ],
      });
    }
  }

  if (
    input.canReadBudget &&
    budget &&
    budget.greaterThan(0) &&
    actual &&
    progress &&
    progress.greaterThanOrEqualTo(0) &&
    progress.lessThanOrEqualTo(100)
  ) {
    const consumed = actual.dividedBy(budget).times(100);
    if (consumed.minus(progress).greaterThanOrEqualTo(FIFTEEN)) {
      warnings.push({
        kind: 'high_consumption_vs_progress',
        warningClass: 'projected',
        severity: 'warning',
        projectId: input.projectId,
        titleKey: 'consumptionVsProgress.title',
        whyKey: 'consumptionVsProgress.why',
        recommendationKey: 'consumptionVsProgress.recommendation',
        href,
        drivers: [
          driver('drivers.budgetConsumed', null, null, consumed.toDecimalPlaces(0).toFixed(0)),
          driver('drivers.progress', null, null, progress.toDecimalPlaces(0).toFixed(0)),
        ],
      });
    }
  }

  if (input.dataConfidenceLevel === 'needs_data') {
    warnings.push({
      kind: 'missing_data',
      warningClass: 'missing_data',
      severity: 'info',
      projectId: input.projectId,
      titleKey: 'missingData.title',
      whyKey: 'missingData.why',
      recommendationKey: null,
      href,
      drivers: [driver('drivers.confidence', null, null, input.dataConfidenceLevel)],
    });
  }

  return warnings.sort((a, b) => {
    const rank = { critical: 0, warning: 1, info: 2 };
    if (rank[a.severity] !== rank[b.severity]) return rank[a.severity] - rank[b.severity];
    return a.kind.localeCompare(b.kind);
  });
}

export function highestWarningSeverity(
  warnings: readonly EarlyWarning[],
): EarlyWarningSeverity | null {
  if (warnings.length === 0) return null;
  return warnings.reduce<EarlyWarningSeverity>(
    (acc, warning) => worseSeverity(acc, warning.severity),
    'info',
  );
}
