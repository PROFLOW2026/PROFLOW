import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';
import { countOverdueFromBillingRows } from '@/modules/financials/data/billing.repository';
import { composeHomeMonthlyLedger } from '@/modules/financials/domain/home-monthly-ledger';
import { zeroTriplet } from '@/modules/billing/domain/revenue-position';

const ils = (amount: string) => money(amount, 'ILS');
const day = (value: string) => businessDate(value);

describe('countOverdueFromBillingRows', () => {
  it('does not count a fully paid invoice whose residue displays as 0.00', () => {
    const count = countOverdueFromBillingRows(
      {
        currency: 'ILS',
        records: [
          {
            id: 'bill-1',
            dueDate: day('2026-01-10'),
            kind: 'invoice',
            status: 'finalized',
            totalAmount: ils('118.00'),
            subtotalAmount: ils('100.00'),
            taxAmount: ils('18.00'),
            payments: [{ amount: ils('118.001'), amountBasis: 'gross', status: 'recorded' }],
          },
        ],
      },
      day('2026-10-23'),
    );
    expect(count).toBe(0);
  });

  it('still counts a past-due invoice with a real balance', () => {
    const count = countOverdueFromBillingRows(
      {
        currency: 'ILS',
        records: [
          {
            id: 'bill-2',
            dueDate: day('2026-01-10'),
            kind: 'invoice',
            status: 'finalized',
            totalAmount: ils('118.00'),
            subtotalAmount: ils('100.00'),
            taxAmount: ils('18.00'),
            payments: [{ amount: ils('50.00'), amountBasis: 'gross', status: 'recorded' }],
          },
        ],
      },
      day('2026-10-23'),
    );
    expect(count).toBe(1);
  });
});

describe('composeHomeMonthlyLedger', () => {
  it('keeps a later payroll payment out of the salary month and carries the balance forward', () => {
    const ledger = composeHomeMonthlyLedger({
      currency: 'ILS',
      today: day('2026-02-28'),
      startYearMonth: '2026-01',
      billingLoaded: true,
      cashLoaded: true,
      costLoaded: true,
      billing: [
        {
          id: 'inv',
          reference: '1',
          clientName: 'לקוח',
          issueDate: day('2026-01-15'),
          dueDate: day('2026-02-15'),
          status: 'finalized',
          kind: 'invoice',
          subtotalAmount: ils('100'),
          taxAmount: ils('18'),
          totalAmount: ils('118'),
          retentionHeldRemaining: null,
          applications: [
            {
              id: 'pay',
              paymentDate: day('2026-02-10'),
              amount: ils('100'),
              basis: 'net',
              status: 'recorded',
            },
          ],
        },
      ],
      collectionsByMonth: {
        '2026-01': zeroTriplet('ILS'),
        '2026-02': {
          net: ils('100'),
          vat: ils('18'),
          gross: ils('118'),
        },
      },
      cashLines: [
        {
          id: 'payroll:row',
          source: 'payroll',
          name: 'עובד',
          document: '2026-01',
          date: day('2026-02-10'),
          net: ils('8205'),
          gross: ils('8205'),
          href: null,
        },
      ],
      costs: [
        {
          id: 'emc',
          yearMonth: '2026-01',
          kind: 'employer_cost',
          name: 'עובד',
          net: ils('8205'),
          gross: ils('8205'),
          href: null,
        },
      ],
      payroll: [
        {
          id: 'row',
          name: 'עובד',
          yearMonth: '2026-01',
          dueDate: day('2026-02-10'),
          paidAt: day('2026-02-10'),
          expected: ils('8205'),
          paid: ils('8205'),
          href: null,
          voided: false,
        },
      ],
      expenses: [],
      apBills: [],
      dashboardCollectedNet: ils('100'),
      dashboardCashOutNet: ils('8205'),
    });

    const january = ledger.months[0]!;
    const february = ledger.months[1]!;
    expect(Number(january.payrollPaid?.net.amount)).toBe(0);
    expect(Number(january.recognizedCost?.net.amount)).toBe(8205);
    expect(Number(january.payableEnd?.net.amount)).toBe(8205);
    expect(Number(january.receivablesEnd?.net.amount)).toBe(100);
    expect(Number(february.collected?.net.amount)).toBe(100);
    expect(Number(february.payrollPaid?.net.amount)).toBe(8205);
    expect(Number(february.receivablesEnd?.net.amount)).toBe(0);
    expect(Number(february.cumulativeDifference?.net.amount)).toBe(-8105);
    expect(ledger.collectedGapNet).toBeNull();
    expect(ledger.cashOutGapNet).toBeNull();
  });
});
