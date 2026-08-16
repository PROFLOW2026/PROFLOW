import { describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  OCR_TARGET_SHAPE_MESSAGE,
  assertOcrConfirmedTargetShape,
  expenseConfirmTargetShape,
  updateJob,
  resetOcrStoreForTests,
  seedFixtureJob,
  buildFixtureCandidates,
  vendorBillConfirmTargetShape,
} from '@/modules/ocr';

const ORG = '018f0000-0000-7000-8000-0000000000aa';
const EXPENSE = '018f0000-0000-7000-8000-0000000000e1';
const BILL = '018f0000-0000-7000-8000-0000000000b1';

describe('scenario K - OCR confirmed target shape', () => {
  it('allows expense target with expense id and null vendor bill', () => {
    expect(() => assertOcrConfirmedTargetShape(expenseConfirmTargetShape(EXPENSE))).not.toThrow();
  });

  it('allows vendor_bill target with bill id and null expense', () => {
    expect(() =>
      assertOcrConfirmedTargetShape(vendorBillConfirmTargetShape(BILL)),
    ).not.toThrow();
  });

  it('allows unconfirmed shape with both ids null', () => {
    expect(() =>
      assertOcrConfirmedTargetShape({
        confirmedDraftTarget: null,
        confirmedExpenseId: null,
        confirmedVendorBillId: null,
        confirmedVendorCreditId: null,
      }),
    ).not.toThrow();
  });

  it('allows vendor_credit target with credit id and null expense/bill', () => {
    expect(() =>
      assertOcrConfirmedTargetShape({
        confirmedDraftTarget: 'vendor_credit',
        confirmedExpenseId: null,
        confirmedVendorBillId: null,
        confirmedVendorCreditId: '018f0000-0000-7000-8000-0000000000c1',
      }),
    ).not.toThrow();
  });

  it('rejects target without matching ID', () => {
    expect(() =>
      assertOcrConfirmedTargetShape({
        confirmedDraftTarget: 'expense',
        confirmedExpenseId: null,
        confirmedVendorBillId: null,
        confirmedVendorCreditId: null,
      }),
    ).toThrow(DomainRuleError);
    expect(() =>
      assertOcrConfirmedTargetShape({
        confirmedDraftTarget: 'vendor_credit',
        confirmedExpenseId: null,
        confirmedVendorBillId: null,
        confirmedVendorCreditId: null,
      }),
    ).toThrow(DomainRuleError);
  });

  it('rejects expense target with vendor bill id set', () => {
    expect(() =>
      assertOcrConfirmedTargetShape({
        confirmedDraftTarget: 'expense',
        confirmedExpenseId: EXPENSE,
        confirmedVendorBillId: BILL,
        confirmedVendorCreditId: null,
      }),
    ).toThrow(DomainRuleError);
    try {
      assertOcrConfirmedTargetShape({
        confirmedDraftTarget: 'expense',
        confirmedExpenseId: EXPENSE,
        confirmedVendorBillId: BILL,
        confirmedVendorCreditId: null,
      });
    } catch (error) {
      expect((error as DomainRuleError).messageKey).toBe(OCR_TARGET_SHAPE_MESSAGE);
    }
  });

  it('rejects vendor_bill target with expense id set', () => {
    expect(() =>
      assertOcrConfirmedTargetShape({
        confirmedDraftTarget: 'vendor_bill',
        confirmedExpenseId: EXPENSE,
        confirmedVendorBillId: BILL,
        confirmedVendorCreditId: null,
      }),
    ).toThrow(DomainRuleError);
  });

  it('rejects unconfirmed jobs that still reference financial ids', () => {
    expect(() =>
      assertOcrConfirmedTargetShape({
        confirmedDraftTarget: null,
        confirmedExpenseId: EXPENSE,
        confirmedVendorBillId: null,
        confirmedVendorCreditId: null,
      }),
    ).toThrow(DomainRuleError);
  });

  it('store updateJob enforces target shape on write', () => {
    resetOcrStoreForTests();
    const job = seedFixtureJob({
      organizationId: ORG,
      candidates: buildFixtureCandidates(),
    });

    expect(() =>
      updateJob(ORG, job.id, {
        confirmedDraftTarget: 'expense',
        confirmedExpenseId: EXPENSE,
        confirmedVendorBillId: BILL,
      }),
    ).toThrow(DomainRuleError);

    const ok = updateJob(ORG, job.id, {
      ...expenseConfirmTargetShape(EXPENSE),
      status: 'succeeded',
      reviewStatus: 'accepted',
    });
    expect(ok?.confirmedExpenseId).toBe(EXPENSE);
    expect(ok?.confirmedVendorBillId).toBeNull();
    expect(ok?.confirmedDraftTarget).toBe('expense');
  });
});
