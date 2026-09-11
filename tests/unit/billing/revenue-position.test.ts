import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  aggregateRevenuePosition,
  computeRecordRevenuePosition,
  resolvePaymentTriplet,
} from '@/modules/billing/domain/revenue-position';

const ILS = 'ILS';

const invoice118 = {
  kind: 'invoice' as const,
  status: 'finalized' as const,
  subtotalAmount: money('100000', ILS),
  taxAmount: money('18000', ILS),
  totalAmount: money('118000', ILS),
};

describe('revenue-position canonical model', () => {
  it('full NET settlement clears open with no phantom VAT', () => {
    const position = computeRecordRevenuePosition(
      {
        ...invoice118,
        payments: [{ amount: money('100000', ILS), amountBasis: 'net', status: 'recorded' }],
      },
      ILS,
    );
    expect(Number(position!.paid.net.amount)).toBeCloseTo(100000, 2);
    expect(Number(position!.paid.vat.amount)).toBeCloseTo(18000, 2);
    expect(Number(position!.paid.gross.amount)).toBeCloseTo(118000, 2);
    expect(Number(position!.open.net.amount)).toBeCloseTo(0, 2);
    expect(Number(position!.open.vat.amount)).toBeCloseTo(0, 2);
    expect(Number(position!.open.gross.amount)).toBeCloseTo(0, 2);
  });

  it('partial NET 50k / 9k / 59k', () => {
    const position = computeRecordRevenuePosition(
      {
        ...invoice118,
        payments: [{ amount: money('50000', ILS), amountBasis: 'net', status: 'recorded' }],
      },
      ILS,
    );
    expect(Number(position!.paid.net.amount)).toBeCloseTo(50000, 2);
    expect(Number(position!.paid.vat.amount)).toBeCloseTo(9000, 2);
    expect(Number(position!.paid.gross.amount)).toBeCloseTo(59000, 2);
    expect(Number(position!.open.net.amount)).toBeCloseTo(50000, 2);
    expect(Number(position!.open.vat.amount)).toBeCloseTo(9000, 2);
    expect(Number(position!.open.gross.amount)).toBeCloseTo(59000, 2);
  });

  it('multiple NET payments sum correctly', () => {
    const position = computeRecordRevenuePosition(
      {
        ...invoice118,
        payments: [
          { amount: money('30000', ILS), amountBasis: 'net', status: 'recorded' },
          { amount: money('20000', ILS), amountBasis: 'net', status: 'recorded' },
        ],
      },
      ILS,
    );
    expect(Number(position!.paid.net.amount)).toBeCloseTo(50000, 2);
    expect(Number(position!.open.net.amount)).toBeCloseTo(50000, 2);
  });

  it('GROSS legacy payment derives NET proportionally', () => {
    const position = computeRecordRevenuePosition(
      {
        ...invoice118,
        payments: [{ amount: money('59000', ILS), amountBasis: 'gross', status: 'recorded' }],
      },
      ILS,
    );
    expect(Number(position!.paid.net.amount)).toBeCloseTo(50000, 2);
    expect(Number(position!.paid.gross.amount)).toBeCloseTo(59000, 2);
  });

  it('April 2026 invoice 0003 scenario', () => {
    const april = {
      kind: 'invoice' as const,
      status: 'finalized' as const,
      subtotalAmount: money('15840', ILS),
      taxAmount: money('2851.20', ILS),
      totalAmount: money('18691.20', ILS),
    };
    const position = computeRecordRevenuePosition(
      {
        ...april,
        payments: [{ amount: money('15840', ILS), amountBasis: 'net', status: 'recorded' }],
      },
      ILS,
    );
    expect(Number(position!.billed.net.amount)).toBeCloseTo(15840, 2);
    expect(Number(position!.paid.net.amount)).toBeCloseTo(15840, 2);
    expect(Number(position!.paid.gross.amount)).toBeCloseTo(18691.2, 2);
    expect(Number(position!.open.net.amount)).toBeCloseTo(0, 2);
  });

  it('org aggregate BILLED - PAID = OPEN', () => {
    const position = aggregateRevenuePosition(
      [
        {
          ...invoice118,
          payments: [{ amount: money('50000', ILS), amountBasis: 'net', status: 'recorded' }],
        },
        {
          kind: 'invoice',
          status: 'finalized',
          subtotalAmount: money('77416.50', ILS),
          taxAmount: money('13934.97', ILS),
          totalAmount: money('91351.47', ILS),
          payments: [],
        },
      ],
      ILS,
    );
    expect(
      Number(position.billed.net.amount) -
        Number(position.paid.net.amount) -
        Number(position.open.net.amount),
    ).toBeCloseTo(0, 2);
  });
});

describe('resolvePaymentTriplet', () => {
  it('NET without invoice context treats gross as net', () => {
    const triplet = resolvePaymentTriplet(money('1000', ILS), 'net', null);
    expect(Number(triplet.net.amount)).toBeCloseTo(1000, 2);
    expect(Number(triplet.gross.amount)).toBeCloseTo(1000, 2);
  });
});
