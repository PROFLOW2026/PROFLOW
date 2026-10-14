import { describe, expect, it } from 'vitest';
import {
  assertNetBillingLinesSumToSubtotal,
  buildNetBillingLines,
} from '@/modules/billing/domain/billing-line-split';
import { money } from '@/shared/money';

describe('buildNetBillingLines', () => {
  it('single billing → one line equal to subtotal', () => {
    const subtotal = money('48500', 'ILS');
    const lines = buildNetBillingLines({ subtotal, changeOrders: [] });
    expect(lines).toHaveLength(1);
    expect(lines[0]?.lineTotal).toBe('48500.000000');
    assertNetBillingLinesSumToSubtotal(
      lines.map((line) => ({ lineTotal: money(line.lineTotal, 'ILS') })),
      subtotal,
    );
  });

  it('COs 30,000 / 18,500 on billing 48,500 net → proportional split', () => {
    const subtotal = money('48500', 'ILS');
    const lines = buildNetBillingLines({
      subtotal,
      changeOrders: [
        { id: 'co-1', reference: 'CO-1', netAmount: money('30000', 'ILS') },
        { id: 'co-2', reference: 'CO-2', netAmount: money('18500', 'ILS') },
      ],
    });
    expect(lines.map((line) => line.lineTotal)).toEqual(['30000.000000', '18500.000000']);
  });

  it('three equal COs on 10,000 net → even split with remainder on last line', () => {
    const subtotal = money('10000', 'ILS');
    const lines = buildNetBillingLines({
      subtotal,
      changeOrders: [
        { id: 'co-1', reference: null, netAmount: money('10000', 'ILS') },
        { id: 'co-2', reference: null, netAmount: money('10000', 'ILS') },
        { id: 'co-3', reference: null, netAmount: money('10000', 'ILS') },
      ],
    });
    expect(lines.map((line) => line.lineTotal)).toEqual([
      '3333.330000',
      '3333.330000',
      '3333.340000',
    ]);
    assertNetBillingLinesSumToSubtotal(
      lines.map((line) => ({ lineTotal: money(line.lineTotal, 'ILS') })),
      subtotal,
    );
  });
});
