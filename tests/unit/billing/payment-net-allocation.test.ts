import { describe, expect, it } from 'vitest';
import { money } from '@/shared/money';
import {
  aggregateBillingPosition,
  recordNetOutstanding,
  recordOutstanding,
  sumNetPaidAmountsForRecord,
  sumPaidAmountsForRecord,
} from '@/modules/billing/domain/outstanding';

const ILS = 'ILS';

describe('payment NET/GROSS proportional allocation', () => {
  const invoice = {
    kind: 'invoice' as const,
    status: 'finalized' as const,
    subtotalAmount: money('100000', ILS),
    taxAmount: money('18000', ILS),
    totalAmount: money('118000', ILS),
  };

  it('partial payment: NET 50k / VAT 9k / GROSS 59k', () => {
    const payments = [{ amount: money('59000', ILS), status: 'recorded' as const }];
    const paidGross = sumPaidAmountsForRecord('finalized', payments, ILS);
    const paidNet = sumNetPaidAmountsForRecord(invoice, payments, ILS);

    expect(paidGross.amount).toBe('59000.000000');
    expect(Number(paidNet.amount)).toBeCloseTo(50000, 2);

    const openGross = recordOutstanding(
      invoice.totalAmount,
      paidGross,
      invoice.kind,
      invoice.status,
      undefined,
      invoice.taxAmount,
      invoice.subtotalAmount,
    );
    const openNet = recordNetOutstanding({ ...invoice, payments }, ILS);

    expect(Number(openGross.amount)).toBeCloseTo(59000, 2);
    expect(Number(openNet.amount)).toBeCloseTo(50000, 2);
    expect(Number(openNet.amount)).toBeCloseTo(
      Number(invoice.subtotalAmount.amount) - Number(paidNet.amount),
      2,
    );
  });

  it('full payment clears outstanding NET and GROSS', () => {
    const payments = [{ amount: money('118000', ILS), status: 'recorded' as const }];
    const position = aggregateBillingPosition([{ ...invoice, payments }], ILS);

    expect(Number(position.paid.amount)).toBeCloseTo(118000, 2);
    expect(Number(position.netPaid.amount)).toBeCloseTo(100000, 2);
    expect(Number(position.outstanding.amount)).toBeCloseTo(0, 2);
    expect(Number(position.netOutstanding.amount)).toBeCloseTo(0, 2);
  });

  it('multiple payments sum proportionally', () => {
    const payments = [
      { amount: money('29500', ILS), status: 'recorded' as const },
      { amount: money('29500', ILS), status: 'recorded' as const },
    ];
    const paidNet = sumNetPaidAmountsForRecord(invoice, payments, ILS);
    expect(Number(paidNet.amount)).toBeCloseTo(50000, 2);
  });

  it('overpayment: outstanding goes negative on GROSS', () => {
    const payments = [{ amount: money('120000', ILS), status: 'recorded' as const }];
    const position = aggregateBillingPosition([{ ...invoice, payments }], ILS);
    expect(Number(position.outstanding.amount)).toBeLessThan(0);
    expect(Number(position.netOutstanding.amount)).toBeLessThan(0);
  });

  it('credit note reduces NET and GROSS billed', () => {
    const position = aggregateBillingPosition(
      [
        { ...invoice, payments: [] },
        {
          kind: 'credit_note',
          status: 'finalized',
          subtotalAmount: money('10000', ILS),
          taxAmount: money('1800', ILS),
          totalAmount: money('11800', ILS),
          payments: [],
        },
      ],
      ILS,
    );
    expect(Number(position.netInvoiced.amount)).toBeCloseTo(90000, 2);
    expect(Number(position.invoiced.amount)).toBeCloseTo(106200, 2);
    expect(
      Number(position.invoiced.amount) - Number(position.netInvoiced.amount),
    ).toBeCloseTo(16200, 2);
  });

  it('BILLED - PAID = OPEN for NET and GROSS', () => {
    const payments = [{ amount: money('59000', ILS), status: 'recorded' as const }];
    const position = aggregateBillingPosition([{ ...invoice, payments }], ILS);

    const billedNet = Number(position.netInvoiced.amount);
    const billedGross = Number(position.invoiced.amount);
    const paidNet = Number(position.netPaid.amount);
    const paidGross = Number(position.paid.amount);
    const openNet = Number(position.netOutstanding.amount);
    const openGross = Number(position.outstanding.amount);

    expect(billedNet - paidNet - openNet).toBeCloseTo(0, 2);
    expect(billedGross - paidGross - openGross).toBeCloseTo(0, 2);
    expect(billedNet + (billedGross - billedNet) - billedGross).toBeCloseTo(0, 2);
  });
});
