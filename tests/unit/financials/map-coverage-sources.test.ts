import { describe, expect, it } from 'vitest';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import {
  mapCoverageToSources,
  partialNote,
  standalonePartialNotes,
} from '@/modules/financials/ui/map-coverage-sources';

const t = (key: string, values?: Record<string, string | number | Date>) => {
  if (key === 'coverage.partials.foreignCurrencyExpenses') {
    return `${values?.count} foreign expenses excluded`;
  }
  if (key === 'coverage.partials.foreignCurrencyLabor') {
    return `${values?.count} foreign labor excluded`;
  }
  if (key === 'coverage.partials.workforceEntriesMissingCost') {
    return `${values?.count} entries missing cost`;
  }
  if (key === 'coverage.partials.foreignCurrencyBilling') {
    return `${values?.count} foreign billing excluded`;
  }
  if (key === 'coverage.partials.foreignCurrencyContracts') {
    return `${values?.count} foreign contracts excluded`;
  }
  if (key.startsWith('coverage.')) {
    return key.replace('coverage.', '');
  }
  return key;
};

describe('mapCoverageToSources partial notes', () => {
  it('attaches expense partial note to direct expenses source', () => {
    const coverage = buildFinancialCoverage([], new Date(), [
      { reason: 'foreign_currency_expenses_excluded', count: 2 },
    ]);
    const sources = mapCoverageToSources(coverage, t);
    const direct = sources.find((source) => source.label === 'directExpenses');

    expect(direct?.note).toBe('2 foreign expenses excluded');
  });

  it('attaches workforce partial notes to workforce source', () => {
    const coverage = buildFinancialCoverage([], new Date(), [
      { reason: 'foreign_currency_labor_excluded', count: 1 },
      { reason: 'workforce_entries_missing_cost', count: 3 },
    ]);
    const sources = mapCoverageToSources(coverage, t);
    const workforce = sources.find((source) => source.label === 'workforceCosts');

    expect(workforce?.note).toBe('1 foreign labor excluded');
  });

  it('surfaces billing partials as standalone notes', () => {
    const coverage = buildFinancialCoverage([], new Date(), [
      { reason: 'foreign_currency_billing_excluded', count: 4 },
    ]);

    expect(
      standalonePartialNotes(coverage, t, ['foreign_currency_billing_excluded']),
    ).toEqual(['4 foreign billing excluded']);
  });

  it('formats every supported partial reason', () => {
    expect(partialNote('foreign_currency_contracts_excluded', 1, t)).toBe(
      '1 foreign contracts excluded',
    );
    expect(partialNote('foreign_currency_expenses_excluded', 1, t)).toBe(
      '1 foreign expenses excluded',
    );
    expect(partialNote('foreign_currency_labor_excluded', 1, t)).toBe('1 foreign labor excluded');
    expect(partialNote('foreign_currency_billing_excluded', 1, t)).toBe(
      '1 foreign billing excluded',
    );
    expect(partialNote('workforce_entries_missing_cost', 1, t)).toBe('1 entries missing cost');
  });
});
