import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { assertVoidable } from '../domain/lifecycle';
import { findBillingRecordById, updateBillingRecordRow } from '../data/billing.repository';

const BILLING_AUDIT_VOIDED = 'billing_record.voided';

export async function voidBillingRecord(context: OrgContext, billingRecordId: string) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const existing = await findBillingRecordById(
    context.db,
    context.organizationId,
    billingRecordId,
    context.organization.timezone,
  );
  if (!existing) throw new NotFoundError('Billing record');
  assertVoidable(
    existing.status,
    existing.voidsBillingRecordId,
    existing.payments.map((payment) => ({ status: payment.status })),
  );

  const voidedAt = new Date();

  try {
    await assertMonthOpenForRewrite(
      context,
      yearMonthFromBusinessDate(existing.issueDate),
    );

    await updateBillingRecordRow(context.db, context.organizationId, billingRecordId, {
      status: 'void',
      voidedAt,
    });
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
  }

  await recordAuditEvent(context, {
    action: BILLING_AUDIT_VOIDED,
    entityType: 'billing_record',
    entityId: billingRecordId,
    before: { status: 'finalized' },
    after: { status: 'void', voidedAt: voidedAt.toISOString() },
  });

  const voided = await findBillingRecordById(
    context.db,
    context.organizationId,
    billingRecordId,
    context.organization.timezone,
  );
  if (!voided) throw new NotFoundError('Billing record');
  return voided;
}
