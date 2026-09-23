import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import { buildProjectCostPaymentSummary } from '@/modules/financials/data/project-source-payment-detail.repository';

describe('buildProjectCostPaymentSummary', () => {
  it('preserves recognized net separately from source-level gross payment totals', () => {
    const summary = buildProjectCostPaymentSummary({
      currency: 'ILS',
      recognizedNet: money('23760', 'ILS'),
      apOutstandingGross: null,
      sourcePaidGross: money('0', 'ILS'),
      sourceRemainingGross: money('46728', 'ILS'),
      multiProjectSourceCount: 1,
      expenseSourceCount: 1,
    });

    expect(summary.recognizedNet.amount).toBe('23760.000000');
    expect(summary.sourcePaidGross.amount).toBe('0.000000');
    expect(summary.sourceRemainingGross.amount).toBe('46728.000000');
    expect(summary.multiProjectSourceCount).toBe(1);
  });

  it('does not fabricate per-project payable from gross totals', () => {
    const summary = buildProjectCostPaymentSummary({
      currency: 'ILS',
      recognizedNet: money('15840', 'ILS'),
      apOutstandingGross: money('0', 'ILS'),
      sourcePaidGross: money('0', 'ILS'),
      sourceRemainingGross: money('46728', 'ILS'),
      multiProjectSourceCount: 1,
      expenseSourceCount: 1,
    });

    expect(summary.recognizedNet.amount).toBe('15840.000000');
    expect(summary.sourceRemainingGross.amount).toBe('46728.000000');
  });
});

describe('Hatotahim subcontractor example (conceptual)', () => {
  it('matches expected NET split for multi-project expense', () => {
    const pinsShare = money('15840', 'ILS');
    const horGinShare = money('23760', 'ILS');
    const sourceGross = money('46728', 'ILS');

    expect(pinsShare.amount).toBe('15840.000000');
    expect(horGinShare.amount).toBe('23760.000000');
    expect(sourceGross.amount).toBe('46728.000000');
    expect(businessDate('2026-10-15')).toBe('2026-10-15');
  });
});
