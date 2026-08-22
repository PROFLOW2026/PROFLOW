import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  plannedCoveragePercent,
  reconcileBillingPlan,
} from '@/modules/billing-plan/domain/plan-reconciliation';

const ILS = 'ILS';

describe('billing-plan reconciliation', () => {
  it('reconciles contract vs planned vs billed vs unplanned', () => {
    const recon = reconcileBillingPlan({
      currency: ILS,
      contractValue: money('1000000', ILS),
      lines: [
        { planLineId: 'l1', agreedAmount: '400000', billedAmount: '100000' },
        { planLineId: 'l2', agreedAmount: '300000', billedAmount: '150000' },
        { planLineId: 'l3', agreedAmount: '200000', billedAmount: '0' },
      ],
    });

    expect(recon.contractValue).toBe('1000000.000000');
    expect(recon.plannedTotal).toBe('900000.000000');
    expect(recon.billedTotal).toBe('250000.000000');
    expect(recon.unplannedAmount).toBe('100000.000000');
    expect(recon.remainingPlanned).toBe('650000.000000');
    expect(recon.overPlanned).toBe(false);
    expect(recon.lines).toHaveLength(3);
    expect(recon.lines[0]!.remainingAmount).toBe('300000.000000');
    expect(recon.lines[0]!.billedPercent).toBe('25.00000000');
  });

  it('flags over-planned when agreed lines exceed contract', () => {
    const recon = reconcileBillingPlan({
      currency: ILS,
      contractValue: '500000',
      lines: [
        { planLineId: 'a', agreedAmount: '400000', billedAmount: '0' },
        { planLineId: 'b', agreedAmount: '200000', billedAmount: '0' },
      ],
    });
    expect(recon.overPlanned).toBe(true);
    expect(recon.unplannedAmount).toBe('-100000.000000');
  });

  it('reports planned coverage percent of contract', () => {
    const planned = money('250000', ILS);
    const contract = money('1000000', ILS);
    expect(plannedCoveragePercent(planned, contract)).toBe('25.00000000');
  });
});
