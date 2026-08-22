import type { FinancialCoverage } from '@/modules/financials/domain/types';
import { isZeroMoney, type MoneyValue } from '@/shared/money';
import type { DataConfidence, DataConfidenceReason } from './data-confidence';

/** Stable codes for dashboard missing-data items — mapped to i18n in UI. */
export type DashboardMissingDataCode = DataConfidenceReason | 'open_price_contract_basis';

export type DashboardMissingDataScope = 'organization' | 'project';

export type DashboardAffectedMetric =
  | 'actual_cost'
  | 'forecast_cost'
  | 'profit'
  | 'margin'
  | 'contract_value'
  | 'billing';

/** Semantic kind — missing information vs workflow/completeness attention. */
export type DashboardCompletenessKind = 'missing' | 'attention';

export interface DashboardMissingDataItem {
  readonly code: DashboardMissingDataCode;
  /** missing = information absent; attention = data exists but worth reviewing. */
  readonly kind: DashboardCompletenessKind;
  /** Required gaps block trustworthy calculations; optional gaps limit specific KPIs. */
  readonly required: boolean;
  readonly severity: 'required' | 'optional';
  readonly scope: DashboardMissingDataScope;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly count: number | null;
  readonly affectedMetrics: readonly DashboardAffectedMetric[];
  readonly actionHref: string;
}

export type DashboardKpiKey =
  | 'contractValue'
  | 'estimatedProfit'
  | 'actualMargin'
  | 'forecastMargin';

export type DashboardKpiAvailability = 'value' | 'unavailable';

export interface DashboardKpiAvailabilityMap {
  readonly contractValue: DashboardKpiAvailability;
  readonly estimatedProfit: DashboardKpiAvailability;
  readonly actualMargin: DashboardKpiAvailability;
  readonly forecastMargin: DashboardKpiAvailability;
  readonly unavailableReasonCode: DashboardMissingDataCode | null;
}

export interface BuildDashboardMissingDataInput {
  readonly dataConfidence: DataConfidence | null;
  readonly costCoverage: FinancialCoverage | null;
  readonly contractValueCoverage: FinancialCoverage | null;
  readonly billingCoverage: FinancialCoverage | null;
  readonly unallocatedBusinessCosts: MoneyValue | null;
  readonly openPriceProjectCount: number;
  readonly pricedProjectCount: number;
  readonly excludedForeignCurrencyCount: number;
  readonly projectMissingCostSignals: readonly {
    readonly projectId: string;
    readonly projectName: string;
    readonly missingCostEntryCount: number;
  }[];
}

const REASON_ACTION: Record<DataConfidenceReason, string> = {
  workforce_entries_missing_cost: '/workforce/time',
  unallocated_remainder: '/expenses',
  open_draft_documents: '/expenses',
  open_allocations: '/overhead',
  foreign_currency_excluded: '/reports?section=comparison',
};

const REASON_AFFECTED: Record<DataConfidenceReason, readonly DashboardAffectedMetric[]> = {
  workforce_entries_missing_cost: ['actual_cost', 'forecast_cost', 'profit', 'margin'],
  unallocated_remainder: ['actual_cost', 'forecast_cost'],
  open_draft_documents: ['actual_cost', 'forecast_cost'],
  open_allocations: ['actual_cost', 'forecast_cost'],
  foreign_currency_excluded: ['contract_value', 'profit', 'margin', 'billing'],
};

const REASON_REQUIRED: Record<DataConfidenceReason, boolean> = {
  workforce_entries_missing_cost: true,
  unallocated_remainder: false,
  open_draft_documents: false,
  open_allocations: false,
  foreign_currency_excluded: false,
};

function partialCount(
  coverages: readonly (FinancialCoverage | null)[],
  reason: string,
): number {
  let total = 0;
  for (const coverage of coverages) {
    for (const partial of coverage?.partials ?? []) {
      if (partial.reason === reason) {
        total += partial.count ?? 0;
      }
    }
  }
  return total;
}

function foreignCurrencyCount(
  coverages: readonly (FinancialCoverage | null)[],
  excludedProjectCount: number,
): number {
  const partialTotal = partialCount(coverages, 'foreign_currency_contracts_excluded') +
    partialCount(coverages, 'foreign_currency_expenses_excluded') +
    partialCount(coverages, 'foreign_currency_labor_excluded') +
    partialCount(coverages, 'foreign_currency_billing_excluded') +
    partialCount(coverages, 'foreign_currency_committed_excluded') +
    partialCount(coverages, 'foreign_currency_ap_excluded');
  return Math.max(excludedProjectCount, partialTotal);
}

const MISSING_INFORMATION_CODES: ReadonlySet<DashboardMissingDataCode> = new Set([
  'workforce_entries_missing_cost',
  'open_price_contract_basis',
]);

function kindForCode(code: DashboardMissingDataCode): DashboardCompletenessKind {
  return MISSING_INFORMATION_CODES.has(code) ? 'missing' : 'attention';
}

function itemForReason(
  reason: DataConfidenceReason,
  count: number | null,
): DashboardMissingDataItem {
  const required = REASON_REQUIRED[reason];
  return {
    code: reason,
    kind: kindForCode(reason),
    required,
    severity: required ? 'required' : 'optional',
    scope: 'organization',
    projectId: null,
    projectName: null,
    count: count != null && count > 0 ? count : null,
    affectedMetrics: REASON_AFFECTED[reason],
    actionHref: REASON_ACTION[reason],
  };
}

/**
 * Derives structured missing-data items from the existing home-dashboard payload.
 * No extra DB — uses merged confidence, coverage partial counts, and rollup hints.
 */
export function buildDashboardMissingDataItems(
  input: BuildDashboardMissingDataInput,
): readonly DashboardMissingDataItem[] {
  const items: DashboardMissingDataItem[] = [];
  const coverages = [
    input.costCoverage,
    input.contractValueCoverage,
    input.billingCoverage,
  ] as const;

  const reasons = new Set(input.dataConfidence?.reasons ?? []);

  if (reasons.has('workforce_entries_missing_cost')) {
    const orgCount = partialCount(coverages, 'workforce_entries_missing_cost');
    if (input.projectMissingCostSignals.length > 0) {
      for (const signal of input.projectMissingCostSignals) {
        items.push({
          code: 'workforce_entries_missing_cost',
          kind: 'missing',
          required: true,
          severity: 'required',
          scope: 'project',
          projectId: signal.projectId,
          projectName: signal.projectName,
          count: signal.missingCostEntryCount,
          affectedMetrics: REASON_AFFECTED.workforce_entries_missing_cost,
          actionHref: `/projects/${signal.projectId}?tab=time`,
        });
      }
    } else {
      items.push(
        itemForReason(
          'workforce_entries_missing_cost',
          orgCount > 0 ? orgCount : null,
        ),
      );
    }
  }

  if (reasons.has('unallocated_remainder')) {
    const hasRemainder =
      input.unallocatedBusinessCosts != null &&
      !isZeroMoney(input.unallocatedBusinessCosts) &&
      Number(input.unallocatedBusinessCosts.amount) > 0;
    if (hasRemainder) {
      items.push(itemForReason('unallocated_remainder', null));
    }
  }

  if (reasons.has('open_draft_documents')) {
    items.push(itemForReason('open_draft_documents', null));
  }

  if (reasons.has('open_allocations')) {
    items.push(itemForReason('open_allocations', null));
  }

  if (reasons.has('foreign_currency_excluded')) {
    const fxCount = foreignCurrencyCount(coverages, input.excludedForeignCurrencyCount);
    items.push(
      itemForReason(
        'foreign_currency_excluded',
        fxCount > 0 ? fxCount : input.excludedForeignCurrencyCount,
      ),
    );
  }

  if (input.openPriceProjectCount > 0 && input.pricedProjectCount === 0) {
    items.push({
      code: 'open_price_contract_basis',
      kind: 'missing',
      required: true,
      severity: 'required',
      scope: 'organization',
      projectId: null,
      projectName: null,
      count: input.openPriceProjectCount,
      affectedMetrics: ['contract_value', 'profit', 'margin'],
      actionHref: '/projects',
    });
  }

  return items;
}

export function partitionDashboardCompletenessItems(
  items: readonly DashboardMissingDataItem[],
): {
  readonly missing: readonly DashboardMissingDataItem[];
  readonly attention: readonly DashboardMissingDataItem[];
} {
  const missing: DashboardMissingDataItem[] = [];
  const attention: DashboardMissingDataItem[] = [];
  for (const item of items) {
    if (item.kind === 'missing') {
      missing.push(item);
    } else {
      attention.push(item);
    }
  }
  return { missing, attention };
}

export function resolveDashboardKpiAvailability(input: {
  readonly missingItems: readonly DashboardMissingDataItem[];
  readonly openPriceProjectCount: number;
  readonly pricedProjectCount: number;
  readonly hasContractValue: boolean;
  readonly hasProfitValue: boolean;
}): DashboardKpiAvailabilityMap {
  const noRevenueBasis =
    input.openPriceProjectCount > 0 && input.pricedProjectCount === 0;
  const contractUnavailable = noRevenueBasis;
  const profitUnavailable = noRevenueBasis;

  return {
    contractValue: contractUnavailable ? 'unavailable' : 'value',
    estimatedProfit: profitUnavailable ? 'unavailable' : 'value',
    actualMargin: profitUnavailable ? 'unavailable' : 'value',
    forecastMargin: profitUnavailable ? 'unavailable' : 'value',
    unavailableReasonCode: noRevenueBasis ? 'open_price_contract_basis' : null,
  };
}
