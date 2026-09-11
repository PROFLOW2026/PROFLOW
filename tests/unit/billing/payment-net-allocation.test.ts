import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  aggregateBillingPosition,
  computeRecordRevenuePosition,
} from '@/modules/billing/domain/outstanding';

const ILS = 'ILS';

describe('payment NET/GROSS basis allocation', () => {
  const invoice = {
    kind: 'invoice' as const,
    status: 'finalized' as const,
    subtotalAmount: money('100000', ILS),
    taxAmount: money('18000', ILS),
    totalAmount: money('118000', ILS),
  };

  it('partial NET payment: 50k / 9k / 59k', () => {
    const payments = [{ amount: money('50000', ILS), amountBasis: 'net' as const, status: 'recorded' as const }];
    const position = computeRecordRevenuePosition({ ...invoice, payments }, ILS)!;

    expect(Number(position.paid.net.amount)).toBeCloseTo(50000, 2);
    expect(Number(position.paid.vat.amount)).toBeCloseTo(9000, 2);
    expect(Number(position.paid.gross.amount)).toBeCloseTo(59000, 2);
    expect(Number(position.open.net.amount)).toBeCloseTo(50000, 2);
  });

  it('full NET payment clears outstanding', () => {
    const payments = [{ amount: money('100000', ILS), amountBasis: 'net' as const, status: 'recorded' as const }];
    const position = aggregateBillingPosition([{ ...invoice, payments }], ILS);

    expect(Number(position.netPaid.amount)).toBeCloseTo(100000, 2);
    expect(Number(position.netOutstanding.amount)).toBeCloseTo(0, 2);
    expect(Number(position.outstanding.amount)).toBeCloseTo(0, 2);
  });

  it('multiple NET payments sum correctly', () => {
    const payments = [
      { amount: money('30000', ILS), amountBasis: 'net' as const, status: 'recorded' as const },
      { amount: money('20000', ILS), amountBasis: 'net' as const, status: 'recorded' as const },
    ];
    const position = aggregateBillingPosition([{ ...invoice, payments }], ILS);
    expect(Number(position.netPaid.amount)).toBeCloseTo(50000, 2);
  });

  it('GROSS partial payment derives NET', () => {
    const payments = [{ amount: money('59000', ILS), amountBasis: 'gross' as const, status: 'recorded' as const }];
    const position = aggregateBillingPosition([{ ...invoice, payments }], ILS);
    expect(Number(position.netPaid.amount)).toBeCloseTo(50000, 2);
    expect(Number(position.paid.amount)).toBeCloseTo(59000, 2);
  });

  it('BILLED - PAID = OPEN for NET and GROSS', () => {
    const payments = [{ amount: money('50000', ILS), amountBasis: 'net' as const, status: 'recorded' as const }];
    const position = aggregateBillingPosition([{ ...invoice, payments }], ILS);

    expect(
      Number(position.netInvoiced.amount) -
        Number(position.netPaid.amount) -
        Number(position.netOutstanding.amount),
    ).toBeCloseTo(0, 2);
    expect(
      Number(position.invoiced.amount) -
        Number(position.paid.amount) -
        Number(position.outstanding.amount),
    ).toBeCloseTo(0, 2);
  });
});
