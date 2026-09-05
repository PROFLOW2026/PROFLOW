import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { businessDate } from '@/shared/dates';
import { fromNumericString, money, subtractMoney, sumMoney, zeroMoney } from '@/shared/money';
import { findClientById } from '@/modules/clients';
import {
  findPaymentById,
  listActiveAppliedAmountsForPayment,
} from '../data/payments.repository';
import type { UnallocatedPaymentRow } from '../domain/types';

/**
 * Load a recorded customer payment with applied / unallocated cash split.
 * Used by the allocate screen even when remainder is still positive.
 */
export async function getPaymentAllocationView(
  context: OrgContext,
  paymentId: string,
): Promise<UnallocatedPaymentRow> {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const payment = await findPaymentById(context.db, context.organizationId, paymentId);
  if (!payment || payment.status !== 'recorded' || !payment.clientId) {
    throw new NotFoundError('Payment');
  }

  const amount = fromNumericString(payment.amount, payment.currency);
  if (!amount) throw new NotFoundError('Payment');

  const appliedAmounts = await listActiveAppliedAmountsForPayment(
    context.db,
    context.organizationId,
    payment.id,
  );
  const appliedAmount =
    appliedAmounts.length > 0
      ? sumMoney(
          appliedAmounts.map((value) => money(value, payment.currency)),
          payment.currency,
        )
      : zeroMoney(payment.currency);
  const unallocatedAmount = subtractMoney(amount, appliedAmount);

  const client = await findClientById(context.db, context.organizationId, payment.clientId);

  return {
    id: payment.id,
    clientId: payment.clientId,
    clientName: client?.name ?? null,
    amount,
    appliedAmount,
    unallocatedAmount,
    paymentDate: businessDate(payment.paymentDate),
    method: payment.method,
    reference: payment.reference,
    status: payment.status,
    notes: payment.notes,
  };
}
