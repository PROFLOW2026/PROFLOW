import { getBillingRecord } from '@/modules/billing';
import { findPaymentById } from '@/modules/billing/data/payments.repository';
import { resolvePaymentTriplet } from '@/modules/billing/domain/revenue-position';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { money } from '@/shared/money';
import type { StatutoryPaymentSnapshot } from '../domain/types';

export async function buildPaymentStatutorySnapshot(
  context: OrgContext,
  paymentId: string,
): Promise<StatutoryPaymentSnapshot> {
  const payment = await findPaymentById(context.db, context.organizationId, paymentId);
  if (!payment) throw new NotFoundError('Payment');
  if (payment.status === 'void') {
    throw new DomainRuleError(
      'Cannot issue statutory receipt for a void payment',
      'invoicingIntegration.errors.paymentVoid',
    );
  }

  const billing =
    payment.billingRecordId != null
      ? await getBillingRecord(context, payment.billingRecordId)
      : null;

  const paymentAmount = money(payment.amount, payment.currency);
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
