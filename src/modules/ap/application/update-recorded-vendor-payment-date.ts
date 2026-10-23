import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { recordAuditEvent } from '@/shared/audit';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
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
import {
  getVendorPaymentsRepository,
  updateVendorPaymentBusinessDate,
} from '../data/payments.repository';
import {
  updateRecordedVendorPaymentDateSchema,
  type UpdateRecordedVendorPaymentDateInput,
} from '../validation/schemas';

export async function updateRecordedVendorPaymentDate(
  context: OrgContext,
  rawInput: UpdateRecordedVendorPaymentDateInput,
) {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  if (!isOrganizationOwner(context)) {
    throw new DomainRuleError(
      'Only the organization owner may correct recorded vendor payment dates',
      'ap.errors.ownerOnlyRetroactiveEdit',
    );
  }

  const parsed = updateRecordedVendorPaymentDateSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  assertBusinessChangeAcknowledged(input.changeAcknowledged, 'ap.errors.confirmRequired');

  const repo = getVendorPaymentsRepository();
  const existing = await repo.findPaymentById(context.db, context.organizationId, input.paymentId);
  if (!existing) throw new NotFoundError('Payment');
  if (existing.status !== 'recorded') {
    throw new DomainRuleError(
      'Only recorded payments can be date-corrected',
      'ap.errors.paymentNotEditable',
      { status: existing.status },
    );
  }

  const nextDate = businessDate(input.paymentDate);
  if (nextDate === existing.paymentDate) {
    throw new ValidationError([{ path: 'paymentDate', message: 'Payment date unchanged' }]);
  }

  const oldMonth = yearMonthFromBusinessDate(existing.paymentDate);
  const newMonth = yearMonthFromBusinessDate(nextDate);

  try {
    await assertMonthOpenForRewrite(context, oldMonth);
    if (newMonth !== oldMonth) {
      await assertMonthOpenForRewrite(context, newMonth);
    }
    await updateVendorPaymentBusinessDate(
      context.db,
      context.organizationId,
      input.paymentId,
      nextDate,
    );
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PAYMENT_DATE_CORRECTED,
    entityType: 'ap_payment',
    entityId: input.paymentId,
    before: {
      correctionKind: 'owner_retroactive',
      paymentDate: existing.paymentDate,
      amount: existing.amount,
      currency: existing.currency,
    },
    after: {
      correctionKind: 'owner_retroactive',
      paymentDate: nextDate,
      amount: existing.amount,
      currency: existing.currency,
    },
  });

  return repo.findPaymentById(context.db, context.organizationId, input.paymentId);
}
