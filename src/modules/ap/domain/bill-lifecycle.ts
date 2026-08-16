/**
 * AP bill lifecycle - void / replace; no silent edit of recognized bills.
 */

import { DomainRuleError } from '@/shared/errors';
import { isRecognizedVendorBillStatus, isVendorBillExcludedFromActual } from './vendor-cost-recognition';
import type { ApBillStatus } from './matching';

/**
 * Recognized (posted) bills cannot be silently rewritten.
 * Correction path = void (+ void payments first) then create a replacement bill,
 * or apply a vendor credit note.
 */
export function assertRecognizedBillNotSilentlyEditable(billStatus: string): void {
  if (isRecognizedVendorBillStatus(billStatus)) {
    throw new DomainRuleError(
      'Recognized vendor bills cannot be silently edited; void and replace, or apply a credit',
      'ap.errors.billNotSilentlyEditable',
    );
  }
}

export function assertApBillVoidable(input: {
  readonly billStatus: string;
  readonly hasActivePayments: boolean;
  readonly hasActiveCredits?: boolean;
}): void {
  if (input.billStatus === 'void') {
    throw new DomainRuleError('Bill is already void', 'ap.errors.billAlreadyVoid');
  }
  if (input.hasActivePayments) {
    throw new DomainRuleError(
      'Void recorded payments before voiding the vendor bill',
      'ap.errors.voidPaymentsFirst',
    );
  }
  if (input.hasActiveCredits) {
    throw new DomainRuleError(
      'Reverse applied vendor credits before voiding the vendor bill',
      'ap.errors.voidCreditsFirst',
    );
  }
}

/** After void, bill must exit Actual recognition. */
export function assertVoidRemovesFromActual(statusAfterVoid: ApBillStatus): void {
  if (!isVendorBillExcludedFromActual(statusAfterVoid)) {
    throw new DomainRuleError(
      'Voided bill must be excluded from Actual recognition',
      'ap.errors.voidStillRecognized',
    );
  }
}
