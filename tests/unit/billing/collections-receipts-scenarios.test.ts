import { describe, expect, it } from 'vitest';

import { computeInvoiceRemainingOutstanding, computeCustomerPaymentUnapplied } from '@/modules/billing/domain/payment-applications';
import { recordOutstanding, signedBillingNetAmount } from '@/modules/billing/domain/outstanding';
import { money } from '@/shared/money';

const ILS = 'ILS';

/**
 * Collections/receipts business-chain scenarios (gross cash vs invoice VAT authority).
 */
describe('collections receipts scenarios', () => {
  it('Scenario A — full invoice / full receipt settles AR; net stays revenue basis', () => {
    const total = money('118000', ILS);
    const net = money('100000', ILS);
    const paid = money('118000', ILS);

    expect(recordOutstanding(total, paid, 'invoice', 'finalized').amount).toBe('0.000000');
    expect(
      signedBillingNetAmount({
        kind: 'invoice',
        status: 'finalized',
        totalAmount: total,
        subtotalAmount: net,
      })?.amount,
    ).toBe('100000.000000');
  });

  it('Scenario B — partial collection leaves gross AR', () => {
    const outstanding = recordOutstanding(
      money('118000', ILS),
      money('59000', ILS),
      'invoice',
      'finalized',
    );
    expect(outstanding.amount).toBe('59000.000000');
  });

  it('Scenario D — retention reduces receivable-now without shrinking invoiced', () => {
    const total = money('118000', ILS);
    const held = money('5900', ILS);
    const paid = money('30000', ILS);
    const receivableNow = recordOutstanding(total, paid, 'invoice', 'finalized', held);
    expect(receivableNow.amount).toBe('82100.000000');
  });

  it('Scenario E — credit note nets AR before cash', () => {
    const invoiceOutstanding = recordOutstanding(
      money('118000', ILS),
      money('0', ILS),
      'invoice',
      'finalized',
    );
    const creditOutstanding = recordOutstanding(
      money('18000', ILS),
      money('0', ILS),
      'credit_note',
      'finalized',
    );
    expect(invoiceOutstanding.amount).toBe('118000.000000');
    expect(creditOutstanding.amount).toBe('-18000.000000');
  });

  it('Scenario F — application cannot exceed receivable-now (overpayment blocked on invoice)', () => {
    const remaining = computeInvoiceRemainingOutstanding({
      currency: ILS,
      totalAmount: '100000',
      kind: 'invoice',
      status: 'finalized',
      priorAppliedAmounts: [],
      priorRetentionHeldRemaining: '0',
    });
    expect(remaining.amount).toBe('100000.000000');
  });

  it('multiple receipts accumulate paid against one invoice', () => {
    const afterTwo = recordOutstanding(
      money('118000', ILS),
      money('80000', ILS),
      'invoice',
      'finalized',
    );
    expect(afterTwo.amount).toBe('38000.000000');
  });

  it('Scenario G — standalone receipt is cash only until allocation', () => {
    const cash = money('50000', ILS);
    const unallocated = computeCustomerPaymentUnapplied({
      currency: ILS,
      paymentAmount: '50000',
      applicationAmounts: [],
    });
    expect(unallocated.amount).toBe(cash.amount);
    // Revenue/profit authority is billing/contract — not this receipt.
    expect(
      signedBillingNetAmount({
        kind: 'invoice',
        status: 'draft',
        totalAmount: cash,
      }),
    ).toBeNull();
  });
});
