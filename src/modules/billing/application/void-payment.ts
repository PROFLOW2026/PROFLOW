import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertPaymentVoidable } from '../domain/lifecycle';
import { findBillingRecordById } from '../data/billing.repository';
import { findPaymentById, updatePaymentStatus } from '../data/payments.repository';

const PAYMENT_AUDIT_VOIDED = 'payment.voided';

export async function voidPayment(context: OrgContext, paymentId: string) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const payment = await findPaymentById(context.db, context.organizationId, paymentId);
  if (!payment) throw new NotFoundError('Payment');
  assertPaymentVoidable(payment.status);

  const voidedAt = new Date();
  await updatePaymentStatus(context.db, context.organizationId, paymentId, 'void', voidedAt);

  await recordAuditEvent(context, {
    action: PAYMENT_AUDIT_VOIDED,
    entityType: 'payment',
    entityId: paymentId,
    before: { status: 'recorded' },
    after: { status: 'void', voidedAt: voidedAt.toISOString() },
  });

  const billingRecord = await findBillingRecordById(
    context.db,
    context.organizationId,
    payment.billingRecordId,
    context.organization.timezone,
  );
  if (!billingRecord) throw new NotFoundError('Billing record');
  return billingRecord;
}
