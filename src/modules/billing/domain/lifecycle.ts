import { DomainRuleError } from '@/shared/errors';
import type { BillingKind, BillingRecordStatus, PaymentRecordStatus } from './types';

type PaymentPresence = { readonly status: PaymentRecordStatus };

export function assertEditable(status: BillingRecordStatus): void {
  if (status !== 'draft') {
    throw new DomainRuleError(
      'Only draft billing records can be edited',
      'billing.errors.notEditable',
      { status },
    );
  }
}

export function assertFinalizable(status: BillingRecordStatus): void {
  if (status !== 'draft') {
    throw new DomainRuleError(
      'Only draft billing records can be finalized',
      'billing.errors.notFinalizable',
      { status },
    );
  }
}

export function assertVoidable(
  status: BillingRecordStatus,
  voidsBillingRecordId: string | null,
  payments: readonly PaymentPresence[] = [],
): void {
  if (status !== 'finalized') {
    throw new DomainRuleError(
      'Only finalized billing records can be voided',
      'billing.errors.notVoidable',
      { status },
    );
  }
  if (voidsBillingRecordId) {
    throw new DomainRuleError(
      'Correcting entries cannot be voided again',
      'billing.errors.correctionNotVoidable',
    );
  }
  if (payments.some((payment) => payment.status === 'recorded')) {
    throw new DomainRuleError(
      'Void recorded payments before voiding the billing record',
      'billing.errors.hasRecordedPayments',
    );
  }
}

export function assertPaymentTarget(
  status: BillingRecordStatus,
  kind: BillingKind = 'invoice',
): void {
  if (status !== 'finalized') {
    throw new DomainRuleError(
      'Payments can only be recorded against finalized billing records',
      'billing.errors.paymentTargetNotFinalized',
      { status },
    );
  }
  // Credit notes reduce AR; cash applications belong on the original invoice/advance.
  if (kind === 'credit_note') {
    throw new DomainRuleError(
      'Payments cannot be recorded against credit notes',
      'billing.errors.paymentTargetCreditNote',
      { kind },
    );
  }
}

export function assertPaymentVoidable(status: PaymentRecordStatus): void {
  if (status !== 'recorded') {
    throw new DomainRuleError(
      'Only recorded payments can be voided',
      'billing.errors.paymentNotVoidable',
      { status },
    );
  }
}

export function recordStatusShape(status: BillingRecordStatus): 'draft' | 'approved' | 'void' {
  if (status === 'draft') return 'draft';
  if (status === 'void') return 'void';
  return 'approved';
}
