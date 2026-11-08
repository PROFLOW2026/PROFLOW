import { DomainRuleError } from '@/shared/errors';

/** One application stays on the same row. Several applications are not split silently. */
export function planRecordedVendorPaymentAmount(applicationIds: readonly string[]): {
  readonly applicationId: string | null;
} {
  if (applicationIds.length > 1) {
    throw new DomainRuleError(
      'A payment applied to more than one bill cannot change amount on this screen',
      'ap.errors.paymentCorrectionMultiApply',
    );
  }
  return { applicationId: applicationIds[0] ?? null };
}
