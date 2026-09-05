import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import { money } from '@/shared/money';
import {
  assertAdditionalCustomerPaymentApplicationsValid,
  assertCustomerPaymentApplicationsValid,
  computeCustomerPaymentUnapplied,
  computeInvoiceRemainingOutstanding,
} from '@/modules/billing/domain/payment-applications';

const ILS = 'ILS';
const CLIENT = '11111111-1111-4111-8111-111111111111';
const INVOICE_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const INVOICE_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';

describe('AR customer payment applications', () => {
  it('allows partial allocation and unapplied remainder', () => {
    expect(
      computeInvoiceRemainingOutstanding({
        currency: ILS,
        totalAmount: '10000',
        kind: 'invoice',
        status: 'finalized',
        priorAppliedAmounts: ['3000'],
      }).amount,
    ).toBe(money('7000', ILS).amount);

    expect(() =>
      assertCustomerPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '10000',
        clientId: CLIENT,
        applications: [
          {
            billingRecordId: INVOICE_A,
            amount: '4000',
            kind: 'invoice',
            status: 'finalized',
            totalAmount: '10000',
            priorAppliedAmounts: [],
            invoiceClientId: CLIENT,
            invoiceCurrency: ILS,
          },
        ],
      }),
    ).not.toThrow();

    expect(
      computeCustomerPaymentUnapplied({
        currency: ILS,
        paymentAmount: '10000',
        applicationAmounts: ['4000'],
      }).amount,
    ).toBe(money('6000', ILS).amount);
  });

  it('allows allocating one payment across multiple invoices', () => {
    expect(() =>
      assertCustomerPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '9000',
        clientId: CLIENT,
        applications: [
          {
            billingRecordId: INVOICE_A,
            amount: '5000',
            kind: 'invoice',
            status: 'finalized',
            totalAmount: '5000',
            priorAppliedAmounts: [],
            invoiceClientId: CLIENT,
            invoiceCurrency: ILS,
          },
          {
            billingRecordId: INVOICE_B,
            amount: '4000',
            kind: 'invoice',
            status: 'finalized',
            totalAmount: '8000',
            priorAppliedAmounts: [],
            invoiceClientId: CLIENT,
            invoiceCurrency: ILS,
          },
        ],
      }),
    ).not.toThrow();
  });

  it('blocks over-application of an invoice and of the payment header', () => {
    try {
      assertCustomerPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '1000',
        clientId: CLIENT,
        applications: [
          {
            billingRecordId: INVOICE_A,
            amount: '1000',
            kind: 'invoice',
            status: 'finalized',
            totalAmount: '500',
            priorAppliedAmounts: [],
            invoiceClientId: CLIENT,
            invoiceCurrency: ILS,
          },
        ],
      });
      throw new Error('expected over-application of invoice');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('billing.errors.paymentOverApplied');
    }

    try {
      assertCustomerPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '1000',
        clientId: CLIENT,
        applications: [
          {
            billingRecordId: INVOICE_A,
            amount: '600',
            kind: 'invoice',
            status: 'finalized',
            totalAmount: '800',
            priorAppliedAmounts: [],
            invoiceClientId: CLIENT,
            invoiceCurrency: ILS,
          },
          {
            billingRecordId: INVOICE_B,
            amount: '600',
            kind: 'invoice',
            status: 'finalized',
            totalAmount: '800',
            priorAppliedAmounts: [],
            invoiceClientId: CLIENT,
            invoiceCurrency: ILS,
          },
        ],
      });
      throw new Error('expected over-application of payment');
    } catch (error) {
      expect(error).toBeInstanceOf(DomainRuleError);
      expect((error as DomainRuleError).messageKey).toBe('billing.errors.applicationsExceedPayment');
    }
  });

  it('does not apply payments onto credit notes', () => {
    expect(() =>
      assertCustomerPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '1000',
        clientId: CLIENT,
        applications: [
          {
            billingRecordId: INVOICE_A,
            amount: '1000',
            kind: 'credit_note',
            status: 'finalized',
            totalAmount: '1000',
            priorAppliedAmounts: [],
            invoiceClientId: CLIENT,
            invoiceCurrency: ILS,
          },
        ],
      }),
    ).toThrow(DomainRuleError);
  });

  it('allows standalone cash on account with zero applications', () => {
    expect(() =>
      assertCustomerPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '50000',
        clientId: CLIENT,
        applications: [],
      }),
    ).not.toThrow();

    expect(
      computeCustomerPaymentUnapplied({
        currency: ILS,
        paymentAmount: '50000',
        applicationAmounts: [],
      }).amount,
    ).toBe(money('50000', ILS).amount);
  });

  it('allows later allocation against remaining unallocated cash', () => {
    expect(() =>
      assertAdditionalCustomerPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '50000',
        alreadyAppliedAmounts: [],
        clientId: CLIENT,
        applications: [
          {
            billingRecordId: INVOICE_A,
            amount: '30000',
            kind: 'invoice',
            status: 'finalized',
            totalAmount: '40000',
            priorAppliedAmounts: [],
            invoiceClientId: CLIENT,
            invoiceCurrency: ILS,
          },
          {
            billingRecordId: INVOICE_B,
            amount: '15000',
            kind: 'invoice',
            status: 'finalized',
            totalAmount: '20000',
            priorAppliedAmounts: [],
            invoiceClientId: CLIENT,
            invoiceCurrency: ILS,
          },
        ],
      }),
    ).not.toThrow();

    expect(
      computeCustomerPaymentUnapplied({
        currency: ILS,
        paymentAmount: '50000',
        applicationAmounts: ['30000', '15000'],
      }).amount,
    ).toBe(money('5000', ILS).amount);
  });
});
