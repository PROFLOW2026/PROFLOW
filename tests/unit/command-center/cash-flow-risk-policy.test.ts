import { describe, expect, it } from 'vitest';
import { shouldSurfaceCashFlowRiskAlert } from '@/modules/command-center/data/collect-next-gen';

describe('cash flow risk alert policy', () => {
  it('suppresses org rollup when only customer billing is overdue', () => {
    expect(shouldSurfaceCashFlowRiskAlert(true, false)).toBe(false);
  });

  it('surfaces when outgoing payables are overdue', () => {
    expect(shouldSurfaceCashFlowRiskAlert(false, true)).toBe(true);
    expect(shouldSurfaceCashFlowRiskAlert(true, true)).toBe(true);
  });

  it('suppresses when neither leg is material', () => {
    expect(shouldSurfaceCashFlowRiskAlert(false, false)).toBe(false);
  });
});
