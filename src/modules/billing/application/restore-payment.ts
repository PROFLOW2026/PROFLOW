import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { recordAuditEvent } from '@/shared/audit';
import { assertClosedMonthSourceEdit } from '@/shared/business-change/assert-owner-retroactive';
import { isOrganizationOwner } from '@/shared/business-change/org-owner';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { yearMonthFromBusinessDate } from '@/modules/month-close';
import { assertBusinessChangeAcknowledged } from '@/shared/business-change/assert-change-acknowledged';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertPaymentRestorable } from '../domain/lifecycle';
import { findBillingRecordById } from '../data/billing.repository';
import {
  findPaymentById,
  listBillingRecordIdsForPayment,
  updatePaymentStatus,
} from '../data/payments.repository';

export async function restorePayment(
  context: OrgContext,
  paymentId: string,
  options?: { readonly changeAcknowledged?: boolean },
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  if (!isOrganizationOwner(context)) {
    throw new DomainRuleError(
      'Only the organization owner may restore a voided payment',
      'billing.errors.ownerOnlyRetroactiveEdit',
    );
  }

  const payment = await findPaymentById(context.db, context.organizationId, paymentId);
  if (!payment) throw new NotFoundError('Payment');
  assertPaymentRestorable(payment.status);
  await assertClosedMonthSourceEdit(
    context,
    yearMonthFromBusinessDate(payment.paymentDate),
    options?.changeAcknowledged,
    'billing.errors.confirmRequired',
  );
  assertBusinessChangeAcknowledged(options?.changeAcknowledged, 'billing.errors.confirmRequired');

  const affectedBillingRecordIds = await listBillingRecordIdsForPayment(
    context.db,
    context.organizationId,
    paymentId,
  );
  await updatePaymentStatus(context.db, context.organizationId, paymentId, 'recorded', null);

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PAYMENT_RESTORED,
    entityType: 'payment',
    entityId: paymentId,
    before: { status: 'void' },
    after: { status: 'recorded', voidedAt: null },
  });

  const billingRecords = [];
  for (const billingRecordId of affectedBillingRecordIds) {
    const billingRecord = await findBillingRecordById(
      context.db,
      context.organizationId,
      billingRecordId,
      context.organization.timezone,
    );
    if (billingRecord) billingRecords.push(billingRecord);
  }

  return {
    billingRecords,
    primaryBillingRecord: billingRecords[0] ?? null,
  };
}
