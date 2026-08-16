import {
  addMoney,
  isZeroMoney,
  zeroMoney,
  type MoneyValue,
} from '@/shared/money';
import type { MetricNature } from './types';

/**
 * Every report figure travels with nature + coverage + currency (docs 04, 29, 46).
 * Never collapse Contract / Billing / Payment or Actual / Committed / Forecast.
 */

export type ReportMetricKind = MetricNature | 'commercial' | 'estimate';

export interface MoneyReportMetric {
  readonly key: string;
  readonly kind: ReportMetricKind;
  readonly value: MoneyValue;
  /** Always equals value.currency - never mix currencies in one metric. */
  readonly currency: string;
  /** i18n keys under dashboard.reports.inclusions.* */
  readonly inclusions: readonly string[];
  /** i18n keys under dashboard.reports.exclusions.* */
  readonly exclusions: readonly string[];
}

export interface CountReportMetric {
  readonly key: string;
  readonly kind: ReportMetricKind | 'operational';
  readonly count: number;
  readonly inclusions: readonly string[];
  readonly exclusions: readonly string[];
}

export function moneyMetric(input: {
  readonly key: string;
  readonly kind: ReportMetricKind;
  readonly value: MoneyValue;
  readonly inclusions?: readonly string[];
  readonly exclusions?: readonly string[];
}): MoneyReportMetric {
  return {
    key: input.key,
    kind: input.kind,
    value: input.value,
    currency: input.value.currency,
    inclusions: input.inclusions ?? [],
    exclusions: input.exclusions ?? [],
  };
}

export function sumMoneyMetrics(
  values: readonly (MoneyValue | null | undefined)[],
  currency: string,
): MoneyValue {
  let total = zeroMoney(currency);
  for (const value of values) {
    if (!value) continue;
    if (value.currency.toUpperCase() !== currency.toUpperCase()) continue;
    total = addMoney(total, value);
  }
  return total;
}

export function hasNonZeroMoney(value: MoneyValue | null | undefined): boolean {
  return value != null && !isZeroMoney(value);
}
