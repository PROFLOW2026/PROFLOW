import type {
  CalculationBasis,
  CostSourceKey,
  CoverageEntry,
  CoveragePartial,
  FinancialCoverage,
} from '@/modules/financials/domain/types';

export interface CostSourcePresence {
  readonly source: CostSourceKey;
  /** True when the organization has real rows of this kind for the scope. */
  readonly hasData: boolean;
}

/**
 * Builds the coverage envelope that every derived figure travels with (doc 04 §10, doc 39).
 *
 * A source with no configured data is absent from coverage - not counted as zero.
 */
export function buildFinancialCoverage(
  sources: readonly CostSourcePresence[],
  calculatedAt: Date = new Date(),
  partials: readonly CoveragePartial[] = [],
): FinancialCoverage {
  const entries: CoverageEntry[] = sources.map((item) => ({
    source: item.source,
    included: item.hasData,
  }));

  const hasAllocatedOverhead = sources.some(
    (item) => item.source === 'allocated_overhead' && item.hasData,
  );
  const hasShared = sources.some((item) => item.source === 'shared_costs' && item.hasData);

  const basis: CalculationBasis =
    hasAllocatedOverhead || hasShared ? 'fully_loaded' : 'direct_only';

  return {
    basis,
    entries,
    calculatedAt,
    partials: partials.length > 0 ? partials : undefined,
  };
}

export function mergeCoveragePartials(
  ...groups: readonly (readonly CoveragePartial[])[]
): CoveragePartial[] {
  const merged = new Map<CoveragePartial['reason'], CoveragePartial>();

  for (const group of groups) {
    for (const partial of group) {
      const existing = merged.get(partial.reason);
      if (existing) {
        merged.set(partial.reason, {
          reason: partial.reason,
          count: (existing.count ?? 0) + (partial.count ?? 0) || undefined,
        });
      } else {
        merged.set(partial.reason, partial);
      }
    }
  }

  return [...merged.values()];
}

export const ALL_COST_SOURCES: readonly CostSourceKey[] = [
  'direct_expenses',
  'workforce',
  'allocated_overhead',
  'shared_costs',
  'subcontractor',
];

export function defaultCostSourcePresence(): CostSourcePresence[] {
  return ALL_COST_SOURCES.map((source) => ({ source, hasData: false }));
}
