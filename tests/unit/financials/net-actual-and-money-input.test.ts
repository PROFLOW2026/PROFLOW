import { describe, expect, it } from 'vitest';
import {
  formatMoneyAmountForInput,
  normalizeMoneyInputText,
} from '@/components/patterns/money-input';
import { aggregateProjectCosts } from '@/modules/financials/domain/cost-aggregation';
import { computeProfitPosition } from '@/modules/financials/domain/profit';
import { money } from '@/shared/money';

describe('money input thousands separators', () => {
  it('treats commas as thousands so 52,000 becomes 52000', () => {
    expect(normalizeMoneyInputText('52,000')).toBe('52000');
    expect(normalizeMoneyInputText('1,234,567.89')).toBe('1234567.89');
  });

  it('keeps period as decimal separator', () => {
    expect(normalizeMoneyInputText('52.5')).toBe('52.5');
  });

  it('rejects invalid characters', () => {
    expect(normalizeMoneyInputText('12a')).toBeNull();
  });
});

describe('money input storage-scale display', () => {
  it('hides six trailing zeros from numeric(18,6) stored values', () => {
    expect(formatMoneyAmountForInput('52000.000000')).toBe('52000');
    expect(formatMoneyAmountForInput('52.500000')).toBe('52.5');
    expect(formatMoneyAmountForInput('12.340000')).toBe('12.34');
  });

  it('leaves in-progress or already-friendly values untouched', () => {
    expect(formatMoneyAmountForInput('52000')).toBe('52000');
    expect(formatMoneyAmountForInput('52.50')).toBe('52.50');
    expect(formatMoneyAmountForInput('1.')).toBe('1.');
  });
});

describe('actual cost net basis (VAT excluded from profit)', () => {
  it('uses net expense amounts so VAT does not inflate actual cost or margin', () => {
    // Simulates loader output after net_amount / net-scaled allocations.
    const aggregated = aggregateProjectCosts(
      [
        {
          amount: '52000.00', // net; gross would have been 60840 with 17% VAT
          currency: 'ILS',
          costFamily: 'direct_project',
          isDirectOnProject: true,
          isAllocated: false,
          isSubcontractor: false,
        },
      ],
      null,
      'ILS',
    );

    expect(aggregated.cost.actualCostToDate).toEqual(money('52000', 'ILS'));

    const profit = computeProfitPosition(money('1000000', 'ILS'), aggregated.cost.estimatedFinalCost);
    expect(profit.estimatedProfit).toEqual(money('948000', 'ILS'));
  });

  it('draft-shaped contributions are never passed by the loader; empty draft means zero actual', () => {
    const aggregated = aggregateProjectCosts([], null, 'ILS');
    expect(aggregated.cost.actualCostToDate).toEqual(money('0', 'ILS'));
  });
});

describe('allocation across projects sums to source net share', () => {
  it('allocated lines for A/B/C sum to the allocatable net', () => {
    const aggregatedA = aggregateProjectCosts(
      [
        {
          amount: '12000.00',
          currency: 'ILS',
          costFamily: 'business_overhead',
          isDirectOnProject: false,
          isAllocated: true,
          isSubcontractor: false,
        },
      ],
      null,
      'ILS',
    );
    const aggregatedB = aggregateProjectCosts(
      [
        {
          amount: '7200.00',
          currency: 'ILS',
          costFamily: 'business_overhead',
          isDirectOnProject: false,
          isAllocated: true,
          isSubcontractor: false,
        },
      ],
      null,
      'ILS',
    );
    const aggregatedC = aggregateProjectCosts(
      [
        {
          amount: '4800.00',
          currency: 'ILS',
          costFamily: 'business_overhead',
          isDirectOnProject: false,
          isAllocated: true,
          isSubcontractor: false,
        },
      ],
      null,
      'ILS',
    );

    const sum =
      Number(aggregatedA.cost.overheadActual.amount) +
      Number(aggregatedB.cost.overheadActual.amount) +
      Number(aggregatedC.cost.overheadActual.amount);
    expect(sum).toBe(24000);
  });
});
