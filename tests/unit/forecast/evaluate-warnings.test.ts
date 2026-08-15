import { describe, expect, it } from 'vitest';
import { evaluateEarlyWarnings } from '@/modules/forecast/domain/evaluate-warnings';
import type { EarlyWarningInput } from '@/modules/forecast/domain/types';

function base(overrides: Partial<EarlyWarningInput> = {}): EarlyWarningInput {
  return {
    projectId: 'proj-1',
    workKind: 'project',
    currency: 'ILS',
    priceNotSet: false,
    currentContractAmount: '100000.00',
    actualCostAmount: '40000.00',
    forecastFinalCostAmount: '80000.00',
    committedOpenAmount: '10000.00',
    expectedRemainingAmount: '30000.00',
    invoicedAmount: '20000.00',
    outstandingAmount: '5000.00',
    actualMarginPercent: '60.00',
    forecastMarginPercent: '20.00',
    budgetAmount: '90000.00',
    progressPercent: '50',
    dataConfidenceLevel: 'high',
    canReadProfit: true,
    canReadBudget: true,
    canReadBilling: true,
    ...overrides,
  };
}

describe('evaluateEarlyWarnings', () => {
  it('flags confirmed actual over budget from composed figures', () => {
    const warnings = evaluateEarlyWarnings(
      base({ actualCostAmount: '95000.00', forecastFinalCostAmount: '98000.00' }),
    );
    expect(warnings.some((item) => item.kind === 'actual_over_budget')).toBe(true);
    expect(warnings.find((item) => item.kind === 'actual_over_budget')?.warningClass).toBe(
      'confirmed',
    );
  });

  it('flags projected over-budget when forecast exceeds budget but actual does not', () => {
    const warnings = evaluateEarlyWarnings(
      base({ actualCostAmount: '40000.00', forecastFinalCostAmount: '120000.00' }),
    );
    expect(warnings.some((item) => item.kind === 'projected_cost_over_budget')).toBe(true);
    expect(warnings.some((item) => item.kind === 'actual_over_budget')).toBe(false);
  });

  it('does not invent profit warnings when profit is hidden', () => {
    const warnings = evaluateEarlyWarnings(
      base({ canReadProfit: false, forecastMarginPercent: '-12.00' }),
    );
    expect(warnings.some((item) => item.kind === 'forecast_margin_negative')).toBe(false);
    expect(warnings.some((item) => item.kind === 'margin_deterioration')).toBe(false);
  });

  it('does not use budget when the viewer cannot read budgets', () => {
    const warnings = evaluateEarlyWarnings(
      base({ canReadBudget: false, actualCostAmount: '200000.00' }),
    );
    expect(warnings.some((item) => item.kind === 'actual_over_budget')).toBe(false);
  });

  it('emits missing-data separately from confirmed problems', () => {
    const warnings = evaluateEarlyWarnings(base({ dataConfidenceLevel: 'needs_data' }));
    const missing = warnings.find((item) => item.kind === 'missing_data');
    expect(missing?.warningClass).toBe('missing_data');
    expect(missing?.severity).toBe('info');
  });

  it('does not claim billing lag without billing permission', () => {
    const warnings = evaluateEarlyWarnings(
      base({
        canReadBilling: false,
        invoicedAmount: '1000.00',
        actualCostAmount: '80000.00',
      }),
    );
    expect(warnings.some((item) => item.kind === 'billing_lag')).toBe(false);
  });
});
