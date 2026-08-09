import { describe, expect, it } from 'vitest';
import { buildFinancialCoverage, mergeCoveragePartials } from '@/modules/financials/domain/coverage';

describe('financial coverage partials', () => {
  it('merges partial flags by reason', () => {
    const merged = mergeCoveragePartials(
      [{ reason: 'foreign_currency_expenses_excluded', count: 1 }],
      [{ reason: 'foreign_currency_expenses_excluded', count: 2 }],
      [{ reason: 'workforce_entries_missing_cost', count: 3 }],
    );

    expect(merged).toEqual([
      { reason: 'foreign_currency_expenses_excluded', count: 3 },
      { reason: 'workforce_entries_missing_cost', count: 3 },
    ]);
  });

  it('attaches partial flags to the coverage envelope', () => {
    const coverage = buildFinancialCoverage([], new Date('2026-01-01'), [
      { reason: 'foreign_currency_contracts_excluded', count: 1 },
    ]);

    expect(coverage.partials).toEqual([
      { reason: 'foreign_currency_contracts_excluded', count: 1 },
    ]);
  });
});
