import { describe, expect, it } from 'vitest';
import { businessDate } from '@/shared/dates';
import { DomainRuleError } from '@/shared/errors';
import { formatMoney } from '@/shared/money';
import { money } from '@/shared/money/money';
import { computePayablesAging } from '@/modules/ap/domain/payables-aging';
import {
  aggregateVendorOutstanding,
  applySequentialBillPayments,
  assertApPaymentCurrencyMatch,
  assertPaymentApplicationNotMutable,
  assertPaymentApplicationsValid,
  assertPaymentFinancialFieldsImmutable,
  assertPaymentMetadataEditable,
  assertPaymentNotDeletable,
  assertPaymentVoidable,
  assertVendorPaymentDoesNotAffectActual,
  computeBillOutstanding,
  computeBillRemainingOutstanding,
  computePaymentRemaining,
  derivePayableStatus,
  isVendorPaymentRecognizedActual,
} from '@/modules/ap';
import { composeVendorCostRecognition } from '@/modules/ap/domain/vendor-cost-recognition';
import {
  createInMemoryVendorPaymentsRepository,
} from '@/modules/ap/data/payments.repository';

const ILS = 'ILS';

describe('vendor payments domain (cash ≠ Actual)', () => {
  it('Bill 92k → pay 50 → 42; pay 30 → 12; final → 0; Actual stays 92k', () => {
    const recognized = composeVendorCostRecognition({
      currency: ILS,
      recognizedBillAmounts: ['92000'],
      linkedExpenseAmounts: [],
    });
    expect(recognized.netRecognizedVendorActual.amount).toBe(money('92000', ILS).amount);
    expect(isVendorPaymentRecognizedActual()).toBe(false);
    assertVendorPaymentDoesNotAffectActual();

    const sequence = applySequentialBillPayments({
      currency: ILS,
      billTotal: '92000',
      billStatus: 'open',
      paymentAmounts: ['50000', '30000', '12000'],
      recognizedActual: recognized.netRecognizedVendorActual.amount,
    });

    expect(sequence.outstandingAfterEach).toEqual([
      money('42000', ILS).amount,
      money('12000', ILS).amount,
      money('0', ILS).amount,
    ]);
    expect(sequence.finalOutstanding).toBe(money('0', ILS).amount);
    expect(sequence.finalPayableStatus).toBe('paid');
    expect(sequence.recognizedActualUnchanged).toBe(money('92000', ILS).amount);
    expect(sequence.actualEqualsBill).toBe(true);

    // he-IL display contract: 52,000 ₪ style via formatMoney
    expect(formatMoney(money('52000', ILS), 'he-IL')).toMatch(/52/);
    expect(formatMoney(money('52000', ILS), 'he-IL')).toMatch(/₪/);
  });

  it('derives unpaid / partial / paid from applications; void payments excluded', () => {
    const billTotal = money('10000', ILS);
    expect(
      derivePayableStatus({
        billStatus: 'open',
        billTotal,
        applications: [],
      }),
    ).toBe('unpaid');

    expect(
      derivePayableStatus({
        billStatus: 'open',
        billTotal,
        applications: [
          { appliedAmount: money('4000', ILS), paymentStatus: 'recorded' },
        ],
      }),
    ).toBe('partial');

    expect(
      computeBillOutstanding({
        billStatus: 'open',
        billTotal,
        applications: [
          { appliedAmount: money('4000', ILS), paymentStatus: 'recorded' },
          { appliedAmount: money('6000', ILS), paymentStatus: 'void' },
        ],
      }).amount,
    ).toBe(money('6000', ILS).amount);

    expect(
      derivePayableStatus({
        billStatus: 'matched',
        billTotal,
        applications: [
          { appliedAmount: money('10000', ILS), paymentStatus: 'recorded' },
        ],
      }),
    ).toBe('paid');

    expect(
      derivePayableStatus({
        billStatus: 'draft',
        billTotal,
        applications: [],
      }),
    ).toBeNull();
  });

  it('rejects over-application and requires applications to sum to payment header', () => {
    expect(() =>
      assertPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '50000',
        applications: [
          {
            apBillId: '11111111-1111-4111-8111-111111111111',
            appliedAmount: '60000',
            billStatus: 'open',
            billTotal: '92000',
            priorAppliedAmounts: [],
          },
        ],
      }),
    ).toThrow(DomainRuleError);

    expect(() =>
      assertPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '50000',
        applications: [
          {
            apBillId: '11111111-1111-4111-8111-111111111111',
            appliedAmount: '40000',
            billStatus: 'open',
            billTotal: '92000',
            priorAppliedAmounts: [],
          },
        ],
      }),
    ).toThrow(DomainRuleError);

    expect(() =>
      assertPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '50000',
        applications: [
          {
            apBillId: '11111111-1111-4111-8111-111111111111',
            appliedAmount: '50000',
            billStatus: 'open',
            billTotal: '92000',
            priorAppliedAmounts: [],
          },
        ],
      }),
    ).not.toThrow();
  });

  it('void is explicit — only recorded payments are voidable', () => {
    expect(() => assertPaymentVoidable('recorded')).not.toThrow();
    expect(() => assertPaymentVoidable('void')).toThrow(DomainRuleError);
  });

  it('rejects delete / financial rewrite; allows recorded metadata only', () => {
    expect(() => assertPaymentNotDeletable()).toThrow(DomainRuleError);
    expect(() => assertPaymentApplicationNotMutable()).toThrow(DomainRuleError);
    expect(() =>
      assertPaymentFinancialFieldsImmutable({ amount: true }),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertPaymentFinancialFieldsImmutable({ currency: true }),
    ).toThrow(DomainRuleError);
    expect(() => assertPaymentFinancialFieldsImmutable({})).not.toThrow();
    expect(() => assertPaymentMetadataEditable('recorded')).not.toThrow();
    expect(() => assertPaymentMetadataEditable('void')).toThrow(DomainRuleError);
  });

  it('rejects currency mismatch (no FX) and computes remaining helpers', () => {
    expect(() => assertApPaymentCurrencyMatch('ILS', 'USD')).toThrow(DomainRuleError);
    expect(() => assertApPaymentCurrencyMatch('ils', 'ILS')).not.toThrow();

    expect(
      computeBillRemainingOutstanding({
        currency: ILS,
        billTotal: '92000',
        billStatus: 'open',
        priorAppliedAmounts: ['50000'],
      }).amount,
    ).toBe(money('42000', ILS).amount);

    expect(
      computePaymentRemaining({
        currency: ILS,
        paymentAmount: '50000',
        applicationAmounts: ['30000', '20000'],
      }).amount,
    ).toBe(money('0', ILS).amount);

    expect(() =>
      assertPaymentApplicationsValid({
        currency: ILS,
        paymentAmount: '50000',
        applications: [
          {
            apBillId: '11111111-1111-4111-8111-111111111111',
            appliedAmount: '50000',
            billStatus: 'open',
            billTotal: '92000',
            priorAppliedAmounts: ['50000'],
          },
        ],
      }),
    ).toThrow(DomainRuleError);
  });

  it('aggregates vendor / org outstanding and ages by due date', () => {
    const bills = [
      {
        billStatus: 'open',
        billTotal: money('92000', ILS),
        applications: [
          { appliedAmount: money('50000', ILS), paymentStatus: 'recorded' as const },
        ],
      },
      {
        billStatus: 'open',
        billTotal: money('10000', ILS),
        applications: [],
      },
    ];
    const agg = aggregateVendorOutstanding({ currency: ILS, bills });
    expect(agg.billed.amount).toBe(money('102000', ILS).amount);
    expect(agg.paid.amount).toBe(money('50000', ILS).amount);
    expect(agg.outstanding.amount).toBe(money('52000', ILS).amount);
    expect(agg.partialCount).toBe(1);
    expect(agg.unpaidCount).toBe(1);

    const aging = computePayablesAging(
      [
        {
          ...bills[0]!,
          dueDate: businessDate('2026-07-01'),
          projectId: 'proj-1',
          vendorId: 'vendor-1',
        },
        {
          ...bills[1]!,
          dueDate: businessDate('2026-08-15'),
          projectId: null,
          vendorId: 'vendor-1',
        },
      ],
      ILS,
      businessDate('2026-08-10'),
    );
    expect(aging.totalOutstanding.amount).toBe(money('52000', ILS).amount);
    expect(aging.buckets.find((b) => b.key === 'days_31_60')?.total.amount).toBe(
      money('42000', ILS).amount,
    );
    expect(aging.buckets.find((b) => b.key === 'current')?.total.amount).toBe(
      money('10000', ILS).amount,
    );
  });
});

describe('open AP cash outstanding vs Actual (payment applications)', () => {
  it('reduces open AP / cash outstanding by active applications without changing Actual', () => {
    const billTotal = money('92000', ILS);
    const recognized = composeVendorCostRecognition({
      currency: ILS,
      recognizedBillAmounts: [billTotal.amount],
      linkedExpenseAmounts: [],
    });

    const unpaid = computeBillOutstanding({
      billStatus: 'open',
      billTotal,
      applications: [],
    });
    expect(unpaid.amount).toBe(money('92000', ILS).amount);

    const afterPartial = computeBillOutstanding({
      billStatus: 'matched',
      billTotal,
      applications: [
        { appliedAmount: money('50000', ILS), paymentStatus: 'recorded' },
      ],
    });
    expect(afterPartial.amount).toBe(money('42000', ILS).amount);

    const afterVoidIgnored = computeBillOutstanding({
      billStatus: 'matched',
      billTotal,
      applications: [
        { appliedAmount: money('50000', ILS), paymentStatus: 'void' },
        { appliedAmount: money('12000', ILS), paymentStatus: 'recorded' },
      ],
    });
    expect(afterVoidIgnored.amount).toBe(money('80000', ILS).amount);

    // Actual Cost path ignores payments entirely.
    expect(recognized.netRecognizedVendorActual.amount).toBe(billTotal.amount);
    expect(isVendorPaymentRecognizedActual()).toBe(false);
  });
});

describe('vendor payments repository tenant isolation (in-memory)', () => {
  it('never returns another organization payment or application', async () => {
    const repo = createInMemoryVendorPaymentsRepository();
    const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const orgB = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const billA = '11111111-1111-4111-8111-111111111111';
    const billB = '22222222-2222-4222-8222-222222222222';

    const paymentA = await repo.insertPayment(null as never, {
      organizationId: orgA,
      vendorId: '33333333-3333-4333-8333-333333333333',
      amount: money('50000', ILS).amount,
      currency: ILS,
      paymentDate: businessDate('2026-08-10'),
      method: 'transfer',
      reference: 'REF-A',
      notes: null,
      createdByUserId: null,
    });
    await repo.insertApplications(null as never, [
      {
        organizationId: orgA,
        apPaymentId: paymentA.id,
        apBillId: billA,
        appliedAmount: money('50000', ILS).amount,
        currency: ILS,
      },
    ]);

    const paymentB = await repo.insertPayment(null as never, {
      organizationId: orgB,
      vendorId: '44444444-4444-4444-8444-444444444444',
      amount: money('10000', ILS).amount,
      currency: ILS,
      paymentDate: businessDate('2026-08-10'),
      method: null,
      reference: null,
      notes: null,
      createdByUserId: null,
    });
    await repo.insertApplications(null as never, [
      {
        organizationId: orgB,
        apPaymentId: paymentB.id,
        apBillId: billB,
        appliedAmount: money('10000', ILS).amount,
        currency: ILS,
      },
    ]);

    expect(await repo.findPaymentById(null as never, orgA, paymentB.id)).toBeNull();
    expect(await repo.listApplicationsForBill(null as never, orgA, billB)).toEqual([]);
    expect(await repo.listActiveAppliedAmountsForBill(null as never, orgA, billA)).toEqual([
      money('50000', ILS).amount,
    ]);
    expect(await repo.listActiveAppliedAmountsForBill(null as never, orgB, billA)).toEqual([]);

    const voided = await repo.voidPayment(null as never, orgA, paymentA.id, new Date());
    expect(voided?.status).toBe('void');
    expect(await repo.listActiveAppliedAmountsForBill(null as never, orgA, billA)).toEqual([]);
  });

  it('allows metadata updates but never deletes financial rows', async () => {
    const repo = createInMemoryVendorPaymentsRepository();
    const orgA = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const payment = await repo.insertPayment(null as never, {
      organizationId: orgA,
      vendorId: '33333333-3333-4333-8333-333333333333',
      amount: money('50000', ILS).amount,
      currency: ILS,
      paymentDate: businessDate('2026-08-10'),
      method: null,
      reference: null,
      notes: null,
      createdByUserId: null,
    });

    const updated = await repo.updatePaymentMetadata(null as never, orgA, payment.id, {
      method: 'cheque',
      reference: 'CHK-1',
      notes: 'office',
    });
    expect(updated?.method).toBe('cheque');
    expect(updated?.amount).toBe(money('50000', ILS).amount);
    expect(repo._payments).toHaveLength(1);
  });
});
