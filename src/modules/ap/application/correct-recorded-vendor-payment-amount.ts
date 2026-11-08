import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { recordAuditEvent } from '@/shared/audit';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertBusinessChangeAcknowledged } from '@/shared/business-change/assert-change-acknowledged';
import { isOrganizationOwner } from '@/shared/business-change/org-owner';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { isPositiveMoney, money } from '@/shared/money/money';
import { assertMonthOpenForRewrite, rethrowClosedPeriodRewrite, yearMonthFromBusinessDate } from '@/modules/month-close';
import { acceptApAmountInput } from '../domain/accept-amount-input';
import { planRecordedVendorPaymentAmount } from '../domain/vendor-payment-amount';
import {
  getVendorPaymentsRepository,
  listVendorPaymentApplicationIds,
  updateRecordedVendorPaymentAmount,
  updateVendorPaymentApplicationAmount,
} from '../data/payments.repository';
import {
  correctRecordedVendorPaymentAmountSchema,
  type CorrectRecordedVendorPaymentAmountInput,
} from '../validation/schemas';

export async function correctRecordedVendorPaymentAmount(
  context: OrgContext,
  rawInput: CorrectRecordedVendorPaymentAmountInput,
): Promise<{ readonly changed: boolean }> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  if (!isOrganizationOwner(context)) {
    throw new DomainRuleError(
      'Only the organization owner may correct recorded vendor payment amounts',
      'ap.errors.ownerOnlyRetroactiveEdit',
    );
  }
  const parsed = correctRecordedVendorPaymentAmountSchema.safeParse(rawInput);
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
      'Only recorded payments can be amount-corrected',
      'ap.errors.paymentNotEditable',
      { status: existing.status },
    );
  }

  const stored = money(acceptApAmountInput(input.amount, existing.currency), existing.currency);
  if (!isPositiveMoney(stored)) {
    throw new DomainRuleError('Payment amount must be positive', 'ap.errors.paymentAmountInvalid');
  }
  const previous = money(existing.amount, existing.currency);
  if (stored.amount === previous.amount) return { changed: false };

  const applicationIds = await listVendorPaymentApplicationIds(
    context.db,
    context.organizationId,
    input.paymentId,
  );
  const plan = planRecordedVendorPaymentAmount(applicationIds);

  try {
    await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(existing.paymentDate));
    await updateRecordedVendorPaymentAmount(
      context.db,
      context.organizationId,
      input.paymentId,
      stored.amount,
    );
    if (plan.applicationId) {
      await updateVendorPaymentApplicationAmount(
        context.db,
        context.organizationId,
        plan.applicationId,
        stored.amount,
      );
    }
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PAYMENT_CORRECTED,
    entityType: 'ap_payment',
    entityId: input.paymentId,
    before: { correctionKind: 'owner_retroactive', amount: existing.amount, currency: existing.currency },
    after: { correctionKind: 'owner_retroactive', amount: stored.amount, currency: existing.currency },
  });
  return { changed: true };
}
