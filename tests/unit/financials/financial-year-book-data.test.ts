import { describe, expect, it } from 'vitest';
import type { BillingRecordSummary, PaymentApplicationRow } from '@/modules/billing/domain/types';
import {
  mapBillingSummaryToYearBookRow,
  mapPaymentApplicationToYearBookReceipt,
  sumYearBookBillingNetRows,
} from '@/modules/financials/domain/financial-year-book/billing-mapping';
import { businessDate } from '@/shared/dates';
import { money } from '@/shared/money';

const ILS = 'ILS';

function billingSummary(
  overrides: Partial<BillingRecordSummary> & Pick<BillingRecordSummary, 'status' | 'kind'>,
): BillingRecordSummary {
  const total = money('11800', ILS);
  const { collectionStatus, ...rest } = overrides;
  return {
    id: 'bill-1',
    projectId: 'proj-1',
    projectName: 'פרויקט א',
    clientId: 'client-1',
    clientName: 'לקוח א',
    reference: 'INV-1',
    issueDate: businessDate('2026-03-01'),
    dueDate: businessDate('2026-03-31'),
    totalAmount: overrides.totalAmount ?? total,
    paidAmount: money('0', ILS),
    outstandingAmount: total,
    subtotalAmount: overrides.subtotalAmount ?? money('10000', ILS),
    taxAmount: overrides.taxAmount ?? money('1800', ILS),
    ...rest,
    collectionStatus: collectionStatus ?? (overrides.status === 'finalized' ? 'open' : null),
  };
}

function paymentRow(overrides: Partial<PaymentApplicationRow>): PaymentApplicationRow {
  return {
    id: 'app-1',
    paymentId: 'pay-1',
    billingRecordId: 'bill-1',
    billingReference: 'INV-1',
    billingKind: 'invoice',
    billingStatus: 'finalized',
    billingSubtotalAmount: money('10000', ILS),
    billingTaxAmount: money('1800', ILS),
    billingTotalAmount: money('11800', ILS),
    projectId: 'proj-1',
    projectName: 'פרויקט א',
    clientName: 'לקוח א',
    paymentAmountBasis: 'gross',
    amount: money('11800', ILS),
    paymentDate: businessDate('2026-03-10'),
    method: null,
    reference: null,
    status: 'recorded',
    notes: null,
    ...overrides,
  };
}

describe('F08 financial year book billing mapping', () => {
  it('excludes draft billings from sheet rows (draft 5k net → 0 rows)', () => {
    const mapped = mapBillingSummaryToYearBookRow(
      billingSummary({
        status: 'draft',
        kind: 'invoice',
        subtotalAmount: money('5000', ILS),
        totalAmount: money('5900', ILS),
        taxAmount: money('900', ILS),
      }),
      ILS,
    );
    expect(mapped.row).toBeNull();
    expect(mapped.fxExcluded).toBe(false);
  });

  it('maps credit_note amounts as negative net/vat/gross', () => {
    const mapped = mapBillingSummaryToYearBookRow(
      billingSummary({
        status: 'finalized',
        kind: 'credit_note',
        subtotalAmount: money('1000', ILS),
        taxAmount: money('180', ILS),
        totalAmount: money('1180', ILS),
      }),
      ILS,
    );
    expect(mapped.row?.net.amount).toBe('-1000.000000');
    expect(mapped.row?.vat.amount).toBe('-180.000000');
    expect(mapped.row?.gross.amount).toBe('-1180.000000');
  });

  it('uses client name instead of project name on billing rows', () => {
    const mapped = mapBillingSummaryToYearBookRow(
      billingSummary({ status: 'finalized', kind: 'invoice', clientName: 'לקוח א' }),
      ILS,
    );
    expect(mapped.row?.client).toBe('לקוח א');
    expect(mapped.row?.project).toBe('פרויקט א');
  });

  it('splits receipt gross into net/vat from linked billing', () => {
    const mapped = mapPaymentApplicationToYearBookReceipt(paymentRow({}), ILS, 'actual');
    expect(mapped.row?.net.amount).toBe('10000.000000');
    expect(mapped.row?.vat.amount).toBe('1800.000000');
    expect(mapped.row?.gross.amount).toBe('11800.000000');
    expect(mapped.row?.client).toBe('לקוח א');
  });

  it('sums billing sheet nets consistently with invoiced summary inputs', () => {
    const rows = [
      mapBillingSummaryToYearBookRow(
        billingSummary({ status: 'finalized', kind: 'invoice', subtotalAmount: money('7000', ILS) }),
        ILS,
      ).row!,
      mapBillingSummaryToYearBookRow(
        billingSummary({
          status: 'finalized',
          kind: 'credit_note',
          subtotalAmount: money('1000', ILS),
          taxAmount: money('180', ILS),
          totalAmount: money('1180', ILS),
        }),
        ILS,
      ).row!,
    ];
    expect(sumYearBookBillingNetRows(rows, ILS).amount).toBe('6000.000000');
  });

  it('omits foreign-currency billing rows and flags fx exclusion', () => {
    const mapped = mapBillingSummaryToYearBookRow(
      billingSummary({
        status: 'finalized',
        kind: 'invoice',
        totalAmount: money('1000', 'USD'),
        subtotalAmount: money('1000', 'USD'),
        taxAmount: money('0', 'USD'),
      }),
      ILS,
    );
    expect(mapped.row).toBeNull();
    expect(mapped.fxExcluded).toBe(true);
  });
});
