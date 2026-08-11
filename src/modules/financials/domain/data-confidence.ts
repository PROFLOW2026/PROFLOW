import type { CoveragePartial, FinancialCoverage } from '@/modules/financials/domain/types';
import { isZeroMoney, type MoneyValue } from '@/shared/money';

/**
 * DATA CONFIDENCE — deterministic incompleteness indicator (no AI scores).
 *
 * Levels (worst signal wins):
 *
 *   needs_data  — figures are known-understated or incomplete for decision use
 *   medium      — figures are usable but known gaps / exclusions apply
 *   high        — no known incompleteness signals for this scope
 *
 * Signals (Agent 3 / architecture):
 *   1. Missing employer / labor cost
 *      → coverage partial `workforce_entries_missing_cost` (count > 0)
 *      → level: needs_data
 *   2. Unallocated remainder
 *      → positive unallocated org / allocation remainder money
 *      → level: medium
 *   3. Open drafts
 *      → draft expenses / draft POs that are not yet in Actual
 *      → level: medium
 *   4. Open allocations
 *      → draft allocation runs or unfinished allocation work
 *      → level: medium
 *   5. Foreign-currency exclusions (coverage partials)
 *      → level: medium
 *   6. Labor dual-source exclusion (Mode B omitted because Mode C present)
 *      → informational only; does NOT lower confidence (Actual is complete for
 *        the chosen labor path — see labor-expense-integrity)
 *
 * Not signals:
 *   - Cost source simply not configured (direct_only basis is fine)
 *   - Open committed PO / ETC (those are Forecast inputs, not incompleteness)
 *   - Pending change requests (commercial disclosure, not cost incompleteness)
 */

export type DataConfidenceLevel = 'high' | 'medium' | 'needs_data';

export type DataConfidenceReason =
  | 'workforce_entries_missing_cost'
  | 'unallocated_remainder'
  | 'open_draft_documents'
  | 'open_allocations'
  | 'foreign_currency_excluded';

export interface DataConfidenceSignals {
  /** Time entries without a rate / employer cost on their date. */
  readonly workforceEntriesMissingCost: number;
  /** Count of FX-excluded rows across contracts/expenses/labor/billing/AP/committed. */
  readonly foreignCurrencyExcludedCount: number;
  /** True when unallocated org/business cost remainder is positive. */
  readonly hasUnallocatedRemainder: boolean;
  /** Draft expenses / draft POs awaiting finalize (not in Actual). */
  readonly openDraftDocumentCount: number;
  /** Draft / unfinished allocation runs awaiting apply. */
  readonly openAllocationCount: number;
}

export interface DataConfidence {
  readonly level: DataConfidenceLevel;
  readonly reasons: readonly DataConfidenceReason[];
}

const LEVEL_RANK: Record<DataConfidenceLevel, number> = {
  high: 0,
  medium: 1,
  needs_data: 2,
};

const FOREIGN_CURRENCY_REASONS: ReadonlySet<CoveragePartial['reason']> = new Set([
  'foreign_currency_contracts_excluded',
  'foreign_currency_expenses_excluded',
  'foreign_currency_labor_excluded',
  'foreign_currency_billing_excluded',
  'foreign_currency_committed_excluded',
  'foreign_currency_ap_excluded',
]);

export function emptyDataConfidenceSignals(): DataConfidenceSignals {
  return {
    workforceEntriesMissingCost: 0,
    foreignCurrencyExcludedCount: 0,
    hasUnallocatedRemainder: false,
    openDraftDocumentCount: 0,
    openAllocationCount: 0,
  };
}

/**
 * Collect incompleteness signals from coverage partials + optional extras.
 * Labor dual-source exclusion is intentionally ignored for confidence.
 */
export function collectDataConfidenceSignals(input: {
  readonly coverage: FinancialCoverage;
  readonly unallocatedRemainder?: MoneyValue | null;
  readonly openDraftDocumentCount?: number;
  readonly openAllocationCount?: number;
}): DataConfidenceSignals {
  let workforceEntriesMissingCost = 0;
  let foreignCurrencyExcludedCount = 0;

  for (const partial of input.coverage.partials ?? []) {
    if (partial.reason === 'workforce_entries_missing_cost') {
      workforceEntriesMissingCost += partial.count ?? 0;
      continue;
    }
    if (FOREIGN_CURRENCY_REASONS.has(partial.reason)) {
      foreignCurrencyExcludedCount += partial.count ?? 0;
    }
  }

  const unallocated = input.unallocatedRemainder ?? null;
  const hasUnallocatedRemainder =
    unallocated != null && !isZeroMoney(unallocated) && Number(unallocated.amount) > 0;

  return {
    workforceEntriesMissingCost,
    foreignCurrencyExcludedCount,
    hasUnallocatedRemainder,
    openDraftDocumentCount: Math.max(0, input.openDraftDocumentCount ?? 0),
    openAllocationCount: Math.max(0, input.openAllocationCount ?? 0),
  };
}

/**
 * Pure confidence resolver. Documented formula — unit-tested; never ML/AI.
 */
export function resolveDataConfidence(signals: DataConfidenceSignals): DataConfidence {
  const reasons: DataConfidenceReason[] = [];
  let level: DataConfidenceLevel = 'high';

  const raise = (next: DataConfidenceLevel, reason: DataConfidenceReason) => {
    if (!reasons.includes(reason)) reasons.push(reason);
    if (LEVEL_RANK[next] > LEVEL_RANK[level]) {
      level = next;
    }
  };

  if (signals.workforceEntriesMissingCost > 0) {
    raise('needs_data', 'workforce_entries_missing_cost');
  }
  if (signals.hasUnallocatedRemainder) {
    raise('medium', 'unallocated_remainder');
  }
  if (signals.openDraftDocumentCount > 0) {
    raise('medium', 'open_draft_documents');
  }
  if (signals.openAllocationCount > 0) {
    raise('medium', 'open_allocations');
  }
  if (signals.foreignCurrencyExcludedCount > 0) {
    raise('medium', 'foreign_currency_excluded');
  }

  return { level, reasons };
}

/** Worst (lowest) confidence across project / org members. */
export function mergeDataConfidence(
  items: readonly DataConfidence[],
): DataConfidence {
  if (items.length === 0) {
    return { level: 'high', reasons: [] };
  }

  let level: DataConfidenceLevel = 'high';
  const reasons = new Set<DataConfidenceReason>();

  for (const item of items) {
    if (LEVEL_RANK[item.level] > LEVEL_RANK[level]) {
      level = item.level;
    }
    for (const reason of item.reasons) {
      reasons.add(reason);
    }
  }

  return { level, reasons: [...reasons] };
}

export function dataConfidenceFromCoverage(
  coverage: FinancialCoverage,
  extras: {
    readonly unallocatedRemainder?: MoneyValue | null;
    readonly openDraftDocumentCount?: number;
    readonly openAllocationCount?: number;
  } = {},
): DataConfidence {
  return resolveDataConfidence(
    collectDataConfidenceSignals({
      coverage,
      unallocatedRemainder: extras.unallocatedRemainder,
      openDraftDocumentCount: extras.openDraftDocumentCount,
      openAllocationCount: extras.openAllocationCount,
    }),
  );
}
