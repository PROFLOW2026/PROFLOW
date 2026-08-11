import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertFinalizable } from '../domain/lifecycle';
import { captureTaxSnapshot } from '../domain/tax';
import { money } from '@/shared/money';
import { heldRemainingOnPost } from '@/modules/retention';
import { findBillingRecordById, updateBillingRecordRow } from '../data/billing.repository';

const BILLING_AUDIT_FINALIZED = 'billing_record.finalized';

export async function finalizeBillingRecord(context: OrgContext, billingRecordId: string) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const existing = await findBillingRecordById(
    context.db,
    context.organizationId,
    billingRecordId,
    context.organization.timezone,
  );
  if (!existing) throw new NotFoundError('Billing record');
  assertFinalizable(existing.status);

  const finalizedAt = new Date();
  const taxSnapshot = captureTaxSnapshot(
    existing.subtotalAmount,
    existing.taxAmount,
    existing.totalAmount,
  );

  await updateBillingRecordRow(context.db, context.organizationId, billingRecordId, {
    status: 'finalized',
    finalizedAt,
    taxSnapshot,
    retentionHeldRemaining: heldRemainingOnPost(
      existing.retentionAmount ?? money('0', existing.totalAmount.currency),
    ),
  });

  await recordAuditEvent(context, {
    action: BILLING_AUDIT_FINALIZED,
    entityType: 'billing_record',
    entityId: billingRecordId,
    before: { status: 'draft' },
    after: { status: 'finalized', finalizedAt },
  });

  const finalized = await findBillingRecordById(
    context.db,
    context.organizationId,
    billingRecordId,
    context.organization.timezone,
  );
  if (!finalized) throw new NotFoundError('Billing record');
  return finalized;
}
