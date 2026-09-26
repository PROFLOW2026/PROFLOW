import { findPaymentById, getBillingRecord } from '@/modules/billing';
import { resolvePaymentTriplet } from '@/modules/billing/domain/revenue-position';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { money } from '@/shared/money';
import type { StatutoryPaymentSnapshot } from '../domain/types';

export async function buildPaymentStatutorySnapshot(
  context: OrgContext,
  paymentId: string,
  options?: {
    readonly billingRecordId?: string | null;
    /** Applied slice for a split allocation. Omitted uses the payment header amount. */
    readonly allocatedAmount?: string | null;
  },
): Promise<StatutoryPaymentSnapshot> {
  const payment = await findPaymentById(context.db, context.organizationId, paymentId);
  if (!payment) throw new NotFoundError('Payment');
  if (payment.status === 'void') {
    throw new DomainRuleError(
      'Cannot issue statutory receipt for a void payment',
      'invoicingIntegration.errors.paymentVoid',
    );
  }

  const billingId = options?.billingRecordId ?? payment.billingRecordId;
  const billing = billingId != null ? await getBillingRecord(context, billingId) : null;

  const allocated = options?.allocatedAmount?.trim();
  const paymentAmount = allocated
    ? money(allocated, payment.currency)
    : money(payment.amount, payment.currency);
  const triplet = resolvePaymentTriplet(
    paymentAmount,
    payment.amountBasis ?? 'net',
    billing,
  );

  return {
    paymentId: payment.id,
    paymentDate: payment.paymentDate,
    grossAmount: triplet.gross.amount,
    netAmount: triplet.net.amount,
    currency: payment.currency,
    method: payment.method,
    reference: payment.reference,
  };
}
