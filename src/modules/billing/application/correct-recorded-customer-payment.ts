import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { recordAuditEvent } from '@/shared/audit';
import { businessDate, type BusinessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertBusinessChangeAcknowledged } from '@/shared/business-change/assert-change-acknowledged';
import { isOrganizationOwner } from '@/shared/business-change/org-owner';
import { compareMoney, money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { findBillingRecordById } from '../data/billing.repository';
import {
  findPaymentById,
  listPaymentApplicationsForPayment,
  listPaymentRowsForBillingRecord,
  updatePaymentAmount,
  updatePaymentApplicationAmount,
  updatePaymentBusinessDate,
} from '../data/payments.repository';
import { computeInvoiceRemainingOutstanding } from '../domain/payment-applications';
import {
  correctRecordedCustomerPaymentSchema,
  type CorrectRecordedCustomerPaymentInput,
} from '../validation/schemas';

async function assertCorrectedPaymentAmountFits(
  context: OrgContext,
  paymentId: string,
  billingRecordId: string,
  nextAmount: string,
): Promise<void> {
  const billingRecord = await findBillingRecordById(
    context.db,
    context.organizationId,
    billingRecordId,
    context.organization.timezone,
  );
  if (!billingRecord) throw new NotFoundError('Billing record');

  const paymentRows = await listPaymentRowsForBillingRecord(
    context.db,
    context.organizationId,
    billingRecordId,
  );
  const currency = billingRecord.totalAmount.currency;
  const priorAppliedAmounts = paymentRows
    .filter((row) => row.status === 'recorded' && row.id !== paymentId)
    .map((row) => row.amount);

  const remaining = computeInvoiceRemainingOutstanding({
    currency,
    totalAmount: billingRecord.totalAmount.amount,
    subtotalAmount: billingRecord.subtotalAmount.amount,
    taxAmount: billingRecord.taxAmount?.amount ?? null,
    kind: billingRecord.kind,
    status: billingRecord.status,
    priorAppliedAmounts,
    priorRetentionHeldRemaining: billingRecord.retentionHeldRemaining?.amount,
  });

  const next = money(nextAmount, currency);
  if (compareMoney(next, remaining) > 0) {
    throw new DomainRuleError(
      'Corrected payment would exceed receivable now',
      'billing.errors.paymentOverApplied',
    );
  }
}

export async function correctRecordedCustomerPayment(
  context: OrgContext,
  rawInput: CorrectRecordedCustomerPaymentInput,
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  if (!isOrganizationOwner(context)) {
    throw new DomainRuleError(
      'Only the organization owner may correct recorded payments',
      'billing.errors.ownerOnlyRetroactiveEdit',
    );
  }

  const parsed = correctRecordedCustomerPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  assertBusinessChangeAcknowledged(input.changeAcknowledged, 'billing.errors.confirmRequired');

  const existing = await findPaymentById(context.db, context.organizationId, input.paymentId);
  if (!existing) throw new NotFoundError('Payment');
  if (existing.status !== 'recorded') {
    throw new DomainRuleError(
      'Only recorded payments can be corrected',
      'billing.errors.paymentNotEditable',
      { status: existing.status },
    );
  }

  const existingPaymentDate = businessDate(existing.paymentDate);
  const nextDate: BusinessDate = input.paymentDate
    ? businessDate(input.paymentDate)
    : existingPaymentDate;
  const touchesDate = input.paymentDate !== undefined && nextDate !== existingPaymentDate;
  const touchesAmount = input.amount !== undefined && input.amount !== existing.amount;

  if (!touchesDate && !touchesAmount) {
    throw new ValidationError([{ path: 'paymentId', message: 'No payment fields changed' }]);
  }

  const applications = await listPaymentApplicationsForPayment(
    context.db,
    context.organizationId,
    input.paymentId,
  );

  if (touchesAmount && applications.length > 1) {
    throw new DomainRuleError(
      'Payments split across multiple invoices cannot be amount-corrected here',
      'billing.errors.paymentCorrectionMultiApply',
    );
  }

  const targetBillingRecordId =
    applications.length === 1
      ? applications[0]!.billingRecordId
      : existing.billingRecordId;

  if (touchesAmount && input.amount && targetBillingRecordId) {
    await assertCorrectedPaymentAmountFits(
      context,
      input.paymentId,
      targetBillingRecordId,
      input.amount,
    );
  }

  const oldMonth = yearMonthFromBusinessDate(existingPaymentDate);
  const newMonth = yearMonthFromBusinessDate(nextDate);

  try {
    await assertMonthOpenForRewrite(context, oldMonth);
    if (touchesDate && newMonth !== oldMonth) {
      await assertMonthOpenForRewrite(context, newMonth);
    }

    if (touchesDate) {
      await updatePaymentBusinessDate(context.db, context.organizationId, input.paymentId, nextDate);
    }
    if (touchesAmount && input.amount) {
      const storedAmount = toNumericString(money(input.amount, existing.currency));
      await updatePaymentAmount(context.db, context.organizationId, input.paymentId, storedAmount);
      if (applications.length === 1) {
        await updatePaymentApplicationAmount(
          context.db,
          context.organizationId,
          input.paymentId,
          applications[0]!.billingRecordId,
          storedAmount,
        );
      }
    }
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
  }

  await recordAuditEvent(context, {
    action: touchesAmount ? AUDIT_ACTIONS.PAYMENT_CORRECTED : AUDIT_ACTIONS.PAYMENT_DATE_CORRECTED,
    entityType: 'payment',
    entityId: input.paymentId,
    before: {
      correctionKind: 'owner_retroactive',
      paymentDate: existing.paymentDate,
      amount: existing.amount,
      currency: existing.currency,
      billingRecordId: targetBillingRecordId,
    },
    after: {
      correctionKind: 'owner_retroactive',
      paymentDate: nextDate,
      amount: touchesAmount && input.amount ? input.amount : existing.amount,
      currency: existing.currency,
      billingRecordId: targetBillingRecordId,
    },
  });

  return findPaymentById(context.db, context.organizationId, input.paymentId);
}
