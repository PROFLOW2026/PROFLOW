import type { CoverageSource } from '@/components/patterns/coverage-disclosure';
import type {
  CostSourceKey,
  CoveragePartialReason,
  FinancialCoverage,
} from '@/modules/financials/domain/types';
import { isCovered } from '@/modules/financials/domain/types';

type FinancialTranslator = (key: string, values?: Record<string, string | number | Date>) => string;

function partialNoteForSource(
  partials: FinancialCoverage['partials'],
  source: CostSourceKey,
  t: FinancialTranslator,
): string | undefined {
  if (!partials?.length) return undefined;

  for (const partial of partials) {
    const note = partialNote(partial.reason, partial.count, t);
    if (!note) continue;

    if (
      (partial.reason === 'foreign_currency_expenses_excluded' && source === 'direct_expenses') ||
      (partial.reason === 'foreign_currency_labor_excluded' && source === 'workforce') ||
      (partial.reason === 'workforce_entries_missing_cost' && source === 'workforce')
    ) {
      return note;
    }
  }

  return undefined;
}

export function partialNote(
  reason: CoveragePartialReason,
  count: number | undefined,
  t: FinancialTranslator,
): string | undefined {
  switch (reason) {
    case 'foreign_currency_contracts_excluded':
      return t('coverage.partials.foreignCurrencyContracts', { count: count ?? 0 });
    case 'foreign_currency_expenses_excluded':
      return t('coverage.partials.foreignCurrencyExpenses', { count: count ?? 0 });
    case 'foreign_currency_labor_excluded':
      return t('coverage.partials.foreignCurrencyLabor', { count: count ?? 0 });
    case 'foreign_currency_billing_excluded':
      return t('coverage.partials.foreignCurrencyBilling', { count: count ?? 0 });
    case 'foreign_currency_committed_excluded':
      return t('coverage.partials.foreignCurrencyCommitted', { count: count ?? 0 });
    case 'foreign_currency_ap_excluded':
      return t('coverage.partials.foreignCurrencyAp', { count: count ?? 0 });
    case 'workforce_entries_missing_cost':
      return t('coverage.partials.workforceEntriesMissingCost', { count: count ?? 0 });
    default:
      return undefined;
  }
}

export function standalonePartialNotes(
  coverage: FinancialCoverage,
  t: FinancialTranslator,
  reasons: readonly CoveragePartialReason[],
): string[] {
  if (!coverage.partials?.length) return [];

  const notes: string[] = [];
  for (const reason of reasons) {
    const partial = coverage.partials.find((item) => item.reason === reason);
    if (!partial) continue;
    const note = partialNote(partial.reason, partial.count, t);
    if (note) notes.push(note);
  }

  return notes;
}

/**
 * Maps domain coverage to the disclosure component's source list (doc 46 §3).
 */
export function mapCoverageToSources(
  coverage: FinancialCoverage,
  t: FinancialTranslator,
): CoverageSource[] {
  const labels: Record<string, string> = {
    direct_expenses: t('coverage.directExpenses'),
    workforce: t('coverage.workforceCosts'),
    allocated_overhead: t('coverage.allocatedOverhead'),
    shared_costs: t('coverage.sharedCosts'),
    subcontractor: t('coverage.subcontractorCosts'),
  };

  return (Object.keys(labels) as CostSourceKey[]).map((source) => ({
    label: labels[source]!,
    included: isCovered(coverage, source),
    note: partialNoteForSource(coverage.partials, source, t),
  }));
}

export function mapCostSourcesToDisclosure(
  sources: readonly { source: string; hasData: boolean }[],
  t: FinancialTranslator,
): CoverageSource[] {
  const labels: Record<string, string> = {
    direct_expenses: t('coverage.directExpenses'),
    workforce: t('coverage.workforceCosts'),
    allocated_overhead: t('coverage.allocatedOverhead'),
    shared_costs: t('coverage.sharedCosts'),
    subcontractor: t('coverage.subcontractorCosts'),
  };

  const bySource = new Map(sources.map((item) => [item.source, item.hasData]));

  return Object.entries(labels).map(([source, label]) => ({
    label,
    included: bySource.get(source) ?? false,
  }));
}
