import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { money } from '@/shared/money';
import { composeVendorCostRecognition } from '@/modules/ap/domain/vendor-cost-recognition';
import { computeBillOutstanding } from '@/modules/ap/domain/vendor-payments';
import {
  recordOutstanding,
  signedBillingAmount,
} from '@/modules/billing/domain/outstanding';
import {
  assertRetentionNotIncreased,
  assertRetentionRelease,
  heldRemainingOnPost,
  resolveRetentionCapture,
} from '@/modules/retention/domain/retention';

const ILS = 'ILS';

describe('retention capture (amount or percent)', () => {
  it('resolves 10% of 100000 to 10000', () => {
    const captured = resolveRetentionCapture({
      totalAmount: '100000',
      currency: ILS,
      retentionPercent: '10',
      side: 'ap',
    });
    expect(captured.amount).toBe(money('10000', ILS).amount);
  });

  it('prefers explicit amount over percent', () => {
    const captured = resolveRetentionCapture({
      totalAmount: '100000',
      currency: ILS,
      retentionAmount: '8000',
      retentionPercent: '10',
      side: 'ar',
    });
    expect(captured.amount).toBe(money('8000', ILS).amount);
  });

  it('rejects retention above total', () => {
    expect(() =>
      resolveRetentionCapture({
        totalAmount: '100000',
        currency: ILS,
        retentionAmount: '100001',
        side: 'ap',
      }),
    ).toThrow(DomainRuleError);
  });
});

describe('payable/receivable now vs recognized (no double count)', () => {
  it('AP: bill 100000 retention 10% → Actual 100000, payable now 90000', () => {
    const billTotal = money('100000', ILS);
    const held = money('10000', ILS);
    const recognized = composeVendorCostRecognition({
      currency: ILS,
      recognizedBillAmounts: [billTotal.amount],
      linkedExpenseAmounts: [],
    });

    const payableNow = computeBillOutstanding({
      billStatus: 'open',
      billTotal,
      applications: [],
      retentionHeldRemaining: held,
    });

    expect(payableNow.amount).toBe(money('90000', ILS).amount);
    expect(recognized.netRecognizedVendorActual.amount).toBe(billTotal.amount);
  });

  it('AR: invoiced stays 100000 while receivable-now is 90000', () => {
    const total = money('100000', ILS);
    const held = money('10000', ILS);
    const invoiced = signedBillingAmount({
      kind: 'invoice',
      status: 'finalized',
      totalAmount: total,
    });
    const receivableNow = recordOutstanding(total, money('0', ILS), 'invoice', 'finalized', held);

    expect(invoiced?.amount).toBe(money('100000', ILS).amount);
    expect(receivableNow.amount).toBe(money('90000', ILS).amount);
  });

  it('release reduces held and increases payable-now without changing Actual / invoiced', () => {
    const billTotal = money('100000', ILS);
    const afterPartialRelease = money('4000', ILS);
    const recognized = composeVendorCostRecognition({
      currency: ILS,
      recognizedBillAmounts: [billTotal.amount],
      linkedExpenseAmounts: [],
    });

    const payableNow = computeBillOutstanding({
      billStatus: 'open',
      billTotal,
      applications: [{ appliedAmount: money('20000', ILS), paymentStatus: 'recorded' }],
      retentionHeldRemaining: afterPartialRelease,
    });

    expect(payableNow.amount).toBe(money('76000', ILS).amount);
    expect(recognized.netRecognizedVendorActual.amount).toBe(billTotal.amount);

    const invoiced = signedBillingAmount({
      kind: 'invoice',
      status: 'finalized',
      totalAmount: billTotal,
    });
    const receivableNow = recordOutstanding(
      billTotal,
      money('20000', ILS),
      'invoice',
      'finalized',
      afterPartialRelease,
    );
    expect(invoiced?.amount).toBe(billTotal.amount);
    expect(receivableNow.amount).toBe(money('76000', ILS).amount);
  });
});

describe('retention release cannot exceed held', () => {
  it('allows partial release while held remaining > 0', () => {
    expect(() =>
      assertRetentionRelease({
        side: 'ap',
        sourcePosted: true,
        heldRemaining: money('10000', ILS),
        amount: money('4000', ILS),
      }),
    ).not.toThrow();
  });

  it('rejects release greater than held remaining', () => {
    expect(() =>
      assertRetentionRelease({
        side: 'ar',
        sourcePosted: true,
        heldRemaining: money('10000', ILS),
        amount: money('10000.01', ILS),
      }),
    ).toThrow(DomainRuleError);
  });

  it('rejects release before post/finalize', () => {
    expect(() =>
      assertRetentionRelease({
        side: 'ap',
        sourcePosted: false,
        heldRemaining: money('10000', ILS),
        amount: money('1000', ILS),
      }),
    ).toThrow(DomainRuleError);
  });

  it('activates held remaining equal to retention on post', () => {
    expect(heldRemainingOnPost(money('10000', ILS))).toBe(money('10000', ILS).amount);
  });

  it('cannot increase retention after post', () => {
    expect(() =>
      assertRetentionNotIncreased(money('10000', ILS), money('12000', ILS), 'ap'),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertRetentionNotIncreased(money('10000', ILS), money('10000', ILS), 'ar'),
    ).not.toThrow();
  });
});
