import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import {
  aggregateBillingPosition,
  computeOutstanding,
  deriveCollectionStatus,
  recordOutstanding,
  signedBillingAmount,
  sumInvoicedAmounts,
  sumPaidAmounts,
} from '@/modules/billing/domain/outstanding';

const currency = 'ILS';
const today = businessDate('2026-08-09');
const pastDue = businessDate('2026-08-01');

describe('billing outstanding arithmetic', () => {
  it('treats finalized invoices as positive invoiced amounts', () => {
    const signed = signedBillingAmount({
      kind: 'invoice',
      status: 'finalized',
      totalAmount: money('1000', currency),
    });
    expect(signed?.amount).toBe('1000.000000');
  });

  it('excludes draft and void records from invoiced', () => {
    expect(
      signedBillingAmount({
        kind: 'invoice',
        status: 'draft',
        totalAmount: money('1000', currency),
      }),
    ).toBeNull();
    expect(
      signedBillingAmount({
        kind: 'invoice',
        status: 'void',
        totalAmount: money('1000', currency),
      }),
    ).toBeNull();
  });

  it('negates credit notes in invoiced totals', () => {
    const invoiced = sumInvoicedAmounts(
      [
        { kind: 'invoice', status: 'finalized', totalAmount: money('1000', currency) },
        { kind: 'credit_note', status: 'finalized', totalAmount: money('200', currency) },
      ],
      currency,
    );
    expect(invoiced.amount).toBe('800.000000');
  });

  it('computes partial payment outstanding', () => {
    const total = money('1000', currency);
    const paid = money('400', currency);
    const outstanding = recordOutstanding(total, paid, 'invoice', 'finalized');
    expect(outstanding.amount).toBe('600.000000');
    expect(deriveCollectionStatus(outstanding, paid, pastDue, today, 'finalized')).toBe('overdue');
    expect(deriveCollectionStatus(outstanding, paid, null, today, 'finalized')).toBe('partial');
  });

  it('marks fully paid and overpaid records as paid', () => {
    const total = money('500', currency);
    const paid = money('500', currency);
    const outstanding = computeOutstanding(total, paid);
    expect(outstanding.amount).toBe('0.000000');
    expect(deriveCollectionStatus(outstanding, paid, pastDue, today, 'finalized')).toBe('paid');

    const overpaid = computeOutstanding(total, money('700', currency));
    expect(overpaid.amount).toBe('-200.000000');
    expect(deriveCollectionStatus(overpaid, money('700', currency), pastDue, today, 'finalized')).toBe(
      'paid',
    );
  });

  it('ignores void payments in paid totals', () => {
    const paid = sumPaidAmounts(
      [
        { amount: money('300', currency), status: 'recorded' },
        { amount: money('100', currency), status: 'void' },
      ],
      currency,
    );
    expect(paid.amount).toBe('300.000000');
  });

  it('aggregates project billing position across records', () => {
    const position = aggregateBillingPosition(
      [
        {
          kind: 'invoice',
          status: 'finalized',
          totalAmount: money('1000', currency),
          payments: [{ amount: money('250', currency), status: 'recorded' }],
        },
        {
          kind: 'invoice',
          status: 'void',
          totalAmount: money('999', currency),
          payments: [],
        },
        {
          kind: 'credit_note',
          status: 'finalized',
          totalAmount: money('100', currency),
          payments: [],
        },
      ],
      currency,
    );

    expect(position.invoiced.amount).toBe('900.000000');
    expect(position.paid.amount).toBe('250.000000');
    expect(position.outstanding.amount).toBe('650.000000');
  });

  it('excludes payments on void and draft records from paid totals', () => {
    const position = aggregateBillingPosition(
      [
        {
          kind: 'invoice',
          status: 'finalized',
          totalAmount: money('10000', currency),
          payments: [],
        },
        {
          kind: 'invoice',
          status: 'void',
          totalAmount: money('10000', currency),
          payments: [{ amount: money('3000', currency), status: 'recorded' }],
        },
      ],
      currency,
    );

    expect(position.invoiced.amount).toBe('10000.000000');
    expect(position.paid.amount).toBe('0.000000');
    expect(position.outstanding.amount).toBe('10000.000000');
  });

  it('nets adjustment credit notes without double-counting a voided original', () => {
    const position = aggregateBillingPosition(
      [
        {
          kind: 'invoice',
          status: 'finalized',
          totalAmount: money('10000', currency),
          payments: [{ amount: money('3000', currency), status: 'recorded' }],
        },
        {
          kind: 'credit_note',
          status: 'finalized',
          totalAmount: money('10000', currency),
          payments: [],
        },
      ],
      currency,
    );

    expect(position.invoiced.amount).toBe('0.000000');
    expect(position.paid.amount).toBe('3000.000000');
    expect(position.outstanding.amount).toBe('-3000.000000');
  });

  it('derives open status when nothing was paid and not overdue', () => {
    const outstanding = money('1000', currency);
    const paid = money('0', currency);
    const futureDue = businessDate('2026-09-01');
    expect(deriveCollectionStatus(outstanding, paid, futureDue, today, 'finalized')).toBe('open');
  });
});
