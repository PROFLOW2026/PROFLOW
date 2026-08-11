import { describe, expect, it } from 'vitest';
import { buildFinancialCoverage } from '@/modules/financials/domain/coverage';
import {
  collectDataConfidenceSignals,
  dataConfidenceFromCoverage,
  mergeDataConfidence,
  resolveDataConfidence,
} from '@/modules/financials/domain/data-confidence';
import { money, zeroMoney } from '@/shared/money';

const ILS = 'ILS';

describe('resolveDataConfidence', () => {
  it('returns high when no incompleteness signals exist', () => {
    const result = resolveDataConfidence({
      workforceEntriesMissingCost: 0,
      foreignCurrencyExcludedCount: 0,
      hasUnallocatedRemainder: false,
      openDraftDocumentCount: 0,
      openAllocationCount: 0,
    });
    expect(result).toEqual({ level: 'high', reasons: [] });
  });

  it('marks needs_data when employer/labor cost is missing', () => {
    const result = resolveDataConfidence({
      workforceEntriesMissingCost: 3,
      foreignCurrencyExcludedCount: 0,
      hasUnallocatedRemainder: false,
      openDraftDocumentCount: 0,
      openAllocationCount: 0,
    });
    expect(result.level).toBe('needs_data');
    expect(result.reasons).toContain('workforce_entries_missing_cost');
  });

  it('marks medium for unallocated remainder, open drafts, open allocations, FX', () => {
    expect(
      resolveDataConfidence({
        workforceEntriesMissingCost: 0,
        foreignCurrencyExcludedCount: 0,
        hasUnallocatedRemainder: true,
        openDraftDocumentCount: 0,
        openAllocationCount: 0,
      }).level,
    ).toBe('medium');

    expect(
      resolveDataConfidence({
        workforceEntriesMissingCost: 0,
        foreignCurrencyExcludedCount: 0,
        hasUnallocatedRemainder: false,
        openDraftDocumentCount: 2,
        openAllocationCount: 0,
      }).reasons,
    ).toContain('open_draft_documents');

    expect(
      resolveDataConfidence({
        workforceEntriesMissingCost: 0,
        foreignCurrencyExcludedCount: 0,
        hasUnallocatedRemainder: false,
        openDraftDocumentCount: 0,
        openAllocationCount: 1,
      }).reasons,
    ).toContain('open_allocations');

    expect(
      resolveDataConfidence({
        workforceEntriesMissingCost: 0,
        foreignCurrencyExcludedCount: 4,
        hasUnallocatedRemainder: false,
        openDraftDocumentCount: 0,
        openAllocationCount: 0,
      }).reasons,
    ).toContain('foreign_currency_excluded');
  });

  it('lets needs_data win over medium when both apply', () => {
    const result = resolveDataConfidence({
      workforceEntriesMissingCost: 1,
      foreignCurrencyExcludedCount: 2,
      hasUnallocatedRemainder: true,
      openDraftDocumentCount: 1,
      openAllocationCount: 1,
    });
    expect(result.level).toBe('needs_data');
    expect(result.reasons).toEqual(
      expect.arrayContaining([
        'workforce_entries_missing_cost',
        'unallocated_remainder',
        'open_draft_documents',
        'open_allocations',
        'foreign_currency_excluded',
      ]),
    );
  });
});

describe('collectDataConfidenceSignals / dataConfidenceFromCoverage', () => {
  it('reads missing employer cost and FX from coverage partials', () => {
    const coverage = buildFinancialCoverage(
      [{ source: 'workforce', hasData: true }],
      new Date(),
      [
        { reason: 'workforce_entries_missing_cost', count: 2 },
        { reason: 'foreign_currency_expenses_excluded', count: 1 },
        { reason: 'labor_category_excluded_for_workforce', count: 5 },
      ],
    );

    const signals = collectDataConfidenceSignals({ coverage });
    // Dual-source labor exclusion is informational — not a confidence signal.
    expect(signals.workforceEntriesMissingCost).toBe(2);
    expect(signals.foreignCurrencyExcludedCount).toBe(1);

    const confidence = dataConfidenceFromCoverage(coverage);
    expect(confidence.level).toBe('needs_data');
  });

  it('treats positive unallocated remainder as medium', () => {
    const coverage = buildFinancialCoverage([], new Date());
    const confidence = dataConfidenceFromCoverage(coverage, {
      unallocatedRemainder: money('150.00', ILS),
    });
    expect(confidence.level).toBe('medium');
    expect(confidence.reasons).toContain('unallocated_remainder');

    const zero = dataConfidenceFromCoverage(coverage, {
      unallocatedRemainder: zeroMoney(ILS),
    });
    expect(zero.level).toBe('high');
  });
});

describe('mergeDataConfidence', () => {
  it('takes the worst level across scopes', () => {
    const merged = mergeDataConfidence([
      { level: 'high', reasons: [] },
      { level: 'medium', reasons: ['foreign_currency_excluded'] },
      { level: 'needs_data', reasons: ['workforce_entries_missing_cost'] },
    ]);
    expect(merged.level).toBe('needs_data');
    expect(merged.reasons).toEqual(
      expect.arrayContaining(['foreign_currency_excluded', 'workforce_entries_missing_cost']),
    );
  });
});
