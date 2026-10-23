import { describe, expect, it } from 'vitest';
import { lifetimeCashDifference } from '@/modules/financials/domain/lifetime-cash-difference';
import {
  listOpenCustomerBills,
  type OpenCustomerBillSource,
} from '@/modules/financials/domain/open-customer-bills';
import { money } from '@/shared/money';

const ILS = 'ILS';

function bill(overrides: Partial<OpenCustomerBillSource> = {}): OpenCustomerBillSource {
  return {
    id: 'bill-1',
    projectId: 'project-1',
    reference: '1001',
    customerName: 'לקוח',
    kind: 'invoice',
    status: 'finalized',
    totalAmount: money('110', ILS),
    subtotalAmount: money('100', ILS),
    taxAmount: money('10', ILS),
    payments: [],
    ...overrides,
  };
}

describe('open customer bills', () => {
  it('keeps open and partial final bills and drops paid, draft, and void bills', () => {
    const bills = listOpenCustomerBills(
      [
        bill(),
        bill({
          id: 'partial',
          reference: '1002',
          payments: [{ amount: money('40', ILS), amountBasis: 'net', status: 'recorded' }],
        }),
        bill({
          id: 'paid',
          payments: [{ amount: money('100', ILS), amountBasis: 'net', status: 'recorded' }],
        }),
        bill({ id: 'draft', status: 'draft' }),
        bill({ id: 'void', status: 'void' }),
      ],
      ILS,
    );

    expect(bills.map((row) => row.id)).toEqual(['bill-1', 'partial']);
    expect(bills[0]?.balanceNet.amount).toBe('100.000000');
    expect(bills[0]?.balanceGross.amount).toBe('110.000000');
    expect(bills[1]?.collectedNet.amount).toBe('40.000000');
    expect(bills[1]?.balanceNet.amount).toBe('60.000000');
    expect(Number(bills[1]?.balanceGross.amount)).toBeCloseTo(66, 5);
  });
});

describe('lifetime cash difference', () => {
  it('subtracts recorded net from recorded net and recorded gross from recorded gross', () => {
    const difference = lifetimeCashDifference({
      receivedNet: money('689979.66', ILS),
      receivedGross: money('814176', ILS),
      paidNet: money('854283.90', ILS),
      paidGross: money('931297.96', ILS),
    });

    expect(difference.net.amount).toBe('-164304.240000');
    expect(difference.gross.amount).toBe('-117121.960000');
  });

  it('uses each movement’s stored VAT instead of a flat 18 percent', () => {
    const difference = lifetimeCashDifference({
      receivedNet: money('100', ILS),
      receivedGross: money('110', ILS),
      paidNet: money('40', ILS),
      paidGross: money('47.2', ILS),
    });

    expect(difference.net.amount).toBe('60.000000');
    expect(difference.gross.amount).toBe('62.800000');
    expect(difference.gross.amount).not.toBe('70.800000');
  });
});
