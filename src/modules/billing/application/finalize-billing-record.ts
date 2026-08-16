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

export type BillingFinalizePermission =
  | typeof PERMISSIONS.BILLING_MANAGE
  | typeof PERMISSIONS.BOQ_BILLING_CREATE;

/**
 * Shared financial finalization (tax snapshot, retention held, finalizedAt, audit).
 * Callers must assert the appropriate capability before invoking.
 */
/** Internal shared finalization engine - not part of the public billing barrel. */
export async function finalizeBillingRecordCore(
  context: OrgContext,
  billingRecordId: string,
) {
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

/** Normal Billing UI entrypoint - requires billing.manage. */
export async function finalizeBillingRecord(context: OrgContext, billingRecordId: string) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  return finalizeBillingRecordCore(context, billingRecordId);
}

/**
 * Finalization under an alternate capability (BOQ progress billing).
 * Same financial engine as {@link finalizeBillingRecord}; does not expand manager roles.
 */
export async function finalizeBillingRecordWithPermission(
  context: OrgContext,
  billingRecordId: string,
  permission: BillingFinalizePermission,
) {
  assertPermission(context, permission);
  return finalizeBillingRecordCore(context, billingRecordId);
}
