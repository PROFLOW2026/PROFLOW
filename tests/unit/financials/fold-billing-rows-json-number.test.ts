import { describe, expect, it } from 'vitest';
import { foldBillingRowsFromBundle } from '@/modules/financials/application/fold-financials-billing-bundle';

describe('foldBillingRowsFromBundle', () => {
  it('accepts fractional money amounts decoded as JS numbers from jsonb', () => {
    const folded = foldBillingRowsFromBundle({
      records: [
        {
          id: '11111111-1111-1111-1111-111111111111',
          dueDate: null,
          kind: 'invoice',
          status: 'finalized',
          // Simulates jsonb_build_object(NUMERIC) without ::text
          totalAmount: 42758.5 as unknown as string,
          subtotalAmount: 42758.5 as unknown as string,
          currency: 'ILS',
          retentionHeldRemaining: 0 as unknown as string,
        },
      ],
      payments: [
        {
          billingRecordId: '11111111-1111-1111-1111-111111111111',
          amount: 42758.5 as unknown as string,
          currency: 'ILS',
          status: 'recorded',
        },
      ],
    });

    expect(folded.records).toHaveLength(1);
    expect(folded.records[0]!.totalAmount.amount).toBe('42758.500000');
    expect(folded.records[0]!.payments[0]!.amount.amount).toBe('42758.500000');
  });
});
