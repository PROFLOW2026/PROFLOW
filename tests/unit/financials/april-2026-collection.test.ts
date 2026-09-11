import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  aggregateRevenuePosition,
  computeRecordRevenuePosition,
} from '@/modules/billing/domain/revenue-position';

const ILS = 'ILS';

describe('April 2026 collection semantics', () => {
  const aprilInvoice = {
    kind: 'invoice' as const,
    status: 'finalized' as const,
    subtotalAmount: money('15840', ILS),
    taxAmount: money('2851.2', ILS),
    totalAmount: money('18691.2', ILS),
  };

  it('full NET settlement matches billing NET and GROSS with no phantom VAT', () => {
    const position = computeRecordRevenuePosition(
      {
        ...aprilInvoice,
        payments: [{ amount: money('15840', ILS), amountBasis: 'net', status: 'recorded' }],
      },
      ILS,
    );
    expect(Number(position!.paid.net.amount)).toBeCloseTo(15840, 2);
    expect(Number(position!.paid.gross.amount)).toBeCloseTo(18691.2, 2);
    expect(Number(position!.open.net.amount)).toBeCloseTo(0, 2);
    expect(Number(position!.open.vat.amount)).toBeCloseTo(0, 2);
    expect(Number(position!.open.gross.amount)).toBeCloseTo(0, 2);
  });

  it('org aggregate reconciliation stays zero when only April is billed and collected', () => {
    const position = aggregateRevenuePosition(
      [
        {
          ...aprilInvoice,
          payments: [{ amount: money('15840', ILS), amountBasis: 'net', status: 'recorded' }],
        },
      ],
      ILS,
    );
    expect(Number(position.billed.net.amount)).toBeCloseTo(15840, 2);
    expect(Number(position.billed.gross.amount)).toBeCloseTo(18691.2, 2);
    expect(Number(position.paid.net.amount)).toBeCloseTo(15840, 2);
    expect(Number(position.paid.gross.amount)).toBeCloseTo(18691.2, 2);
    expect(Number(position.open.net.amount)).toBeCloseTo(0, 2);
    expect(Number(position.open.vat.amount)).toBeCloseTo(0, 2);
  });
});
