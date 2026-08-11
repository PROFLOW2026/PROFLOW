/**
 * Confirmed OCR target shape (app guard; DB CHECK from 0031).
 *
 * Strict invariant — every confirmed target requires its matching ID:
 * - null target → all IDs null
 * - expense → expense id NOT NULL; bill/credit null
 * - vendor_bill → bill id NOT NULL; expense/credit null
 * - vendor_credit → credit id NOT NULL; expense/bill null
 */

import { DomainRuleError } from '@/shared/errors';
import type { OcrDraftTarget } from './types';

export const OCR_TARGET_SHAPE_MESSAGE = 'ocr.errors.invalidTargetShape';

export interface OcrTargetShapeFields {
  readonly confirmedDraftTarget: OcrDraftTarget | null;
  readonly confirmedExpenseId: string | null;
  readonly confirmedVendorBillId: string | null;
  readonly confirmedVendorCreditId: string | null;
}

export function assertOcrConfirmedTargetShape(fields: OcrTargetShapeFields): void {
  const {
    confirmedDraftTarget,
    confirmedExpenseId,
    confirmedVendorBillId,
    confirmedVendorCreditId,
  } = fields;

  if (confirmedDraftTarget == null) {
    if (
      confirmedExpenseId != null ||
      confirmedVendorBillId != null ||
      confirmedVendorCreditId != null
    ) {
      throw new DomainRuleError(
        'Unconfirmed OCR jobs must not reference expense, vendor bill, or vendor credit IDs',
        OCR_TARGET_SHAPE_MESSAGE,
      );
    }
    return;
  }

  if (confirmedDraftTarget === 'expense') {
    if (
      confirmedExpenseId == null ||
      confirmedVendorBillId != null ||
      confirmedVendorCreditId != null
    ) {
      throw new DomainRuleError(
        'Expense OCR confirm requires confirmedExpenseId and null bill/credit IDs',
        OCR_TARGET_SHAPE_MESSAGE,
      );
    }
    return;
  }

  if (confirmedDraftTarget === 'vendor_bill') {
    if (
      confirmedVendorBillId == null ||
      confirmedExpenseId != null ||
      confirmedVendorCreditId != null
    ) {
      throw new DomainRuleError(
        'Vendor bill OCR confirm requires confirmedVendorBillId and null expense/credit IDs',
        OCR_TARGET_SHAPE_MESSAGE,
      );
    }
    return;
  }

  if (confirmedDraftTarget === 'vendor_credit') {
    if (
      confirmedVendorCreditId == null ||
      confirmedExpenseId != null ||
      confirmedVendorBillId != null
    ) {
      throw new DomainRuleError(
        'Vendor credit OCR confirm requires confirmedVendorCreditId and null expense/bill IDs',
        OCR_TARGET_SHAPE_MESSAGE,
      );
    }
    return;
  }
}

/** Shape used when confirming → draft expense (never finalize). */
export function expenseConfirmTargetShape(expenseId: string): OcrTargetShapeFields {
  return {
    confirmedDraftTarget: 'expense',
    confirmedExpenseId: expenseId,
    confirmedVendorBillId: null,
    confirmedVendorCreditId: null,
  };
}

/** Shape used when confirming → draft vendor bill (never open/recognized). */
export function vendorBillConfirmTargetShape(vendorBillId: string): OcrTargetShapeFields {
  return {
    confirmedDraftTarget: 'vendor_bill',
    confirmedExpenseId: null,
    confirmedVendorBillId: vendorBillId,
    confirmedVendorCreditId: null,
  };
}

/** Shape used when confirming → draft vendor credit (never applied/voided). */
export function vendorCreditConfirmTargetShape(vendorCreditId: string): OcrTargetShapeFields {
  return {
    confirmedDraftTarget: 'vendor_credit',
    confirmedExpenseId: null,
    confirmedVendorBillId: null,
    confirmedVendorCreditId: vendorCreditId,
  };
}
