/**
 * Confirmed OCR target shape (app guard; DB CHECK expected from Agent A).
 *
 * - target expense → vendor_bill id NULL; expense id may be set
 * - target vendor_bill → expense id NULL; bill id may be set
 * - no confirmation → both IDs NULL
 */

import { DomainRuleError } from '@/shared/errors';
import type { OcrDraftTarget } from './types';

export const OCR_TARGET_SHAPE_MESSAGE = 'ocr.errors.invalidTargetShape';

export interface OcrTargetShapeFields {
  readonly confirmedDraftTarget: OcrDraftTarget | null;
  readonly confirmedExpenseId: string | null;
  readonly confirmedVendorBillId: string | null;
}

export function assertOcrConfirmedTargetShape(fields: OcrTargetShapeFields): void {
  const { confirmedDraftTarget, confirmedExpenseId, confirmedVendorBillId } = fields;

  if (confirmedDraftTarget == null) {
    if (confirmedExpenseId != null || confirmedVendorBillId != null) {
      throw new DomainRuleError(
        'Unconfirmed OCR jobs must not reference expense or vendor bill IDs',
        OCR_TARGET_SHAPE_MESSAGE,
      );
    }
    return;
  }

  if (confirmedDraftTarget === 'expense') {
    if (confirmedVendorBillId != null) {
      throw new DomainRuleError(
        'Expense OCR confirm must leave confirmedVendorBillId null',
        OCR_TARGET_SHAPE_MESSAGE,
      );
    }
    return;
  }

  if (confirmedDraftTarget === 'vendor_bill') {
    if (confirmedExpenseId != null) {
      throw new DomainRuleError(
        'Vendor bill OCR confirm must leave confirmedExpenseId null',
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
  };
}

/** Shape used when confirming → draft vendor bill (never open/recognized). */
export function vendorBillConfirmTargetShape(vendorBillId: string): OcrTargetShapeFields {
  return {
    confirmedDraftTarget: 'vendor_bill',
    confirmedExpenseId: null,
    confirmedVendorBillId: vendorBillId,
  };
}
