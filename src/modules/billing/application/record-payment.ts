import { recordAuditEvent } from '@/shared/audit';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { compareMoney, money, toNumericString } from '@/shared/money';
import { recordOutstanding } from '../domain/outstanding';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { assertPaymentTarget } from '../domain/lifecycle';
import { findBillingRecordById } from '../data/billing.repository';
import { insertPayment } from '../data/payments.repository';
import { createPaymentSchema, type CreatePaymentInput } from '../validation/schemas';

const PAYMENT_AUDIT_RECORDED = 'payment.recorded';

export async function recordPayment(context: OrgContext, rawInput: CreatePaymentInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const parsed = createPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const billingRecord = await findBillingRecordById(
    context.db,
    context.organizationId,
    input.billingRecordId,
    context.organization.timezone,
  );
  if (!billingRecord) throw new NotFoundError('Billing record');
  assertPaymentTarget(billingRecord.status, billingRecord.kind);

  const paymentAmount = money(input.amount, billingRecord.totalAmount.currency);
  const receivableNow = recordOutstanding(
    billingRecord.totalAmount,
    billingRecord.paidAmount,
    billingRecord.kind,
    billingRecord.status,
    billingRecord.retentionHeldRemaining,
  );
  if (compareMoney(paymentAmount, receivableNow) > 0) {
    throw new DomainRuleError(
      'Payment exceeds receivable now',
      'billing.errors.paymentOverApplied',
    );
  }
  const paymentDate = businessDate(input.paymentDate);

  let paymentId: string;
  try {
    await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(paymentDate));

    // Keep billingRecordId set so migration 0039's AFTER INSERT trigger creates
    // the 1:1 application. Do not also insert payment_applications here.
    paymentId = await insertPayment(context.db, context.organizationId, {
      billingRecordId: input.billingRecordId,
      clientId: billingRecord.clientId,
      amount: toNumericString(paymentAmount),
      currency: billingRecord.totalAmount.currency,
      paymentDate,
      method: input.method?.trim() || null,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      createdByUserId: context.userId,
    });
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
  }

  await recordAuditEvent(context, {
    action: PAYMENT_AUDIT_RECORDED,
    entityType: 'payment',
    entityId: paymentId,
    after: {
      billingRecordId: input.billingRecordId,
      amount: toNumericString(paymentAmount),
      currency: billingRecord.totalAmount.currency,
      paymentDate,
    },
  });

  const updated = await findBillingRecordById(
    context.db,
    context.organizationId,
    input.billingRecordId,
    context.organization.timezone,
  );
  if (!updated) throw new NotFoundError('Billing record');
  return { paymentId, billingRecord: updated };
}
