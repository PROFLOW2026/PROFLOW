import { recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertBusinessChangeAcknowledged } from '@/shared/business-change/assert-change-acknowledged';
import { isOrganizationOwner } from '@/shared/business-change/org-owner';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { cancelIssuedStatutoryDocumentsForBillingVoid } from '@/modules/invoicing-integration/application/cancel-statutory-for-billing-void';
import { assertVoidable } from '../domain/lifecycle';
import { findBillingRecordById, updateBillingRecordRow } from '../data/billing.repository';
import { voidPayment } from './void-payment';

const BILLING_AUDIT_VOIDED = 'billing_record.voided';

export type VoidBillingRecordOptions = {
  readonly changeAcknowledged?: true;
};

export async function voidBillingRecord(
  context: OrgContext,
  billingRecordId: string,
  options?: VoidBillingRecordOptions,
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const existing = await findBillingRecordById(
    context.db,
    context.organizationId,
    billingRecordId,
    context.organization.timezone,
  );
  if (!existing) throw new NotFoundError('Billing record');

  const recordedPayments = existing.payments.filter((payment) => payment.status === 'recorded');
  if (recordedPayments.length > 0) {
    if (!isOrganizationOwner(context)) {
      throw new DomainRuleError(
        'Void recorded payments before voiding the billing record',
        'billing.errors.hasRecordedPayments',
      );
    }
    assertBusinessChangeAcknowledged(options?.changeAcknowledged, 'billing.errors.confirmRequired');
    for (const payment of recordedPayments) {
      await voidPayment(context, payment.id);
    }
  }

  const paymentPresence =
    recordedPayments.length > 0
      ? existing.payments.map((payment) =>
          recordedPayments.some((row) => row.id === payment.id)
            ? { status: 'void' as const }
            : { status: payment.status },
        )
      : existing.payments.map((payment) => ({ status: payment.status }));

  assertVoidable(existing.status, existing.voidsBillingRecordId, paymentPresence);

  const voidedAt = new Date();

  try {
    await assertMonthOpenForRewrite(
      context,
      yearMonthFromBusinessDate(existing.issueDate),
    );

    await cancelIssuedStatutoryDocumentsForBillingVoid(context, billingRecordId);

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
    before: {
      status: existing.status,
      ...(recordedPayments.length > 0
        ? {
            correctionKind: 'owner_retroactive',
            voidedPaymentIds: recordedPayments.map((p) => p.id),
          }
        : {}),
    },
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
