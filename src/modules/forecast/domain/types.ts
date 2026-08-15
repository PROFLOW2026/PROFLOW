/**
 * Early-warning signals derived from composed ProjectFinancials.
 *
 * Not a second financial engine. Every number comes from the existing
 * compose path (Actual / Committed / Forecast / commercial / billing).
 * Recommendations are labelled as such — never accounting truth.
 */

export const EARLY_WARNING_KINDS = [
  'actual_over_budget',
  'projected_cost_over_budget',
  'insufficient_remaining_budget',
  'forecast_margin_negative',
  'margin_deterioration',
  'commitment_pressure',
  'billing_lag',
  'collection_risk',
  'high_consumption_vs_progress',
  'missing_data',
] as const;

export type EarlyWarningKind = (typeof EARLY_WARNING_KINDS)[number];

/** Confirmed actual problem vs projected risk vs incomplete inputs. */
export const EARLY_WARNING_CLASSES = ['confirmed', 'projected', 'missing_data'] as const;
export type EarlyWarningClass = (typeof EARLY_WARNING_CLASSES)[number];

export const EARLY_WARNING_SEVERITIES = ['critical', 'warning', 'info'] as const;
export type EarlyWarningSeverity = (typeof EARLY_WARNING_SEVERITIES)[number];

export interface EarlyWarningDriver {
  readonly labelKey: string;
  readonly amount: string | null;
  readonly currency: string | null;
  readonly percent: string | null;
}

export interface EarlyWarning {
  readonly kind: EarlyWarningKind;
  readonly warningClass: EarlyWarningClass;
  readonly severity: EarlyWarningSeverity;
  readonly projectId: string;
  readonly titleKey: string;
  readonly whyKey: string;
  readonly recommendationKey: string | null;
  readonly drivers: readonly EarlyWarningDriver[];
  readonly href: string;
}

export interface EarlyWarningInput {
  readonly projectId: string;
  readonly workKind: 'project' | 'job' | 'work_order';
  readonly currency: string;
  readonly priceNotSet: boolean;
  readonly currentContractAmount: string | null;
  readonly actualCostAmount: string | null;
  readonly forecastFinalCostAmount: string | null;
  readonly committedOpenAmount: string | null;
  readonly expectedRemainingAmount: string | null;
  readonly invoicedAmount: string | null;
  readonly outstandingAmount: string | null;
  readonly actualMarginPercent: string | null;
  readonly forecastMarginPercent: string | null;
  readonly budgetAmount: string | null;
  /** 0–100 physical/BOQ progress when known. Null = do not invent progress. */
  readonly progressPercent: string | null;
  readonly dataConfidenceLevel: 'high' | 'medium' | 'needs_data';
  readonly canReadProfit: boolean;
  readonly canReadBudget: boolean;
  readonly canReadBilling: boolean;
}
