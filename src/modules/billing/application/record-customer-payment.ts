import { recordAuditEvent } from '@/shared/audit';
import { withTransaction } from '@/shared/db';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findBillingRecordById } from '../data/billing.repository';
import {
  findClientInOrganization,
  insertPayment,
  insertPaymentApplications,
  listActiveAppliedAmountsForBillingRecord,
  lockBillingRecordsForUpdate,
  lockPaymentForUpdate,
} from '../data/payments.repository';
import { assertCustomerPaymentApplicationsValid } from '../domain/payment-applications';
import {
  recordCustomerPaymentSchema,
  type RecordCustomerPaymentInput,
} from '../validation/schemas';

const PAYMENT_AUDIT_RECORDED = 'payment.recorded';

export async function recordCustomerPayment(
  context: OrgContext,
  rawInput: RecordCustomerPaymentInput,
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const parsed = recordCustomerPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const currency = input.currency.toUpperCase();
  const billIds = input.applications.map((app) => app.billingRecordId);

  const paymentId = await withTransaction(context.db, async (tx) => {
    const clientOk = await findClientInOrganization(tx, context.organizationId, input.clientId);
    if (!clientOk) throw new NotFoundError('Client');

    await lockBillingRecordsForUpdate(tx, context.organizationId, billIds);

    const applicationDetails: {
      billingRecordId: string;
      amount: string;
      kind: 'invoice' | 'credit_note' | 'advance' | 'retention_release';
      status: 'draft' | 'finalized' | 'void';
      totalAmount: string;
      priorAppliedAmounts: readonly string[];
      priorRetentionHeldRemaining: string;
      invoiceClientId: string | null;
      invoiceCurrency: string;
    }[] = [];

    for (const app of input.applications) {
      const billingRecord = await findBillingRecordById(
        tx,
        context.organizationId,
        app.billingRecordId,
        context.organization.timezone,
      );
      if (!billingRecord) throw new NotFoundError('Billing record');

      if (billingRecord.totalAmount.currency.toUpperCase() !== currency) {
        throw new DomainRuleError(
          'Invoice currency must match payment currency',
          'billing.errors.paymentCurrencyMismatch',
        );
      }

      const prior = await listActiveAppliedAmountsForBillingRecord(
        tx,
        context.organizationId,
        billingRecord.id,
      );

      applicationDetails.push({
        billingRecordId: billingRecord.id,
        amount: app.amount,
        kind: billingRecord.kind,
        status: billingRecord.status,
        totalAmount: toNumericString(billingRecord.totalAmount),
        priorAppliedAmounts: prior,
        priorRetentionHeldRemaining: toNumericString(
          billingRecord.retentionHeldRemaining ?? money('0', currency),
        ),
        invoiceClientId: billingRecord.clientId,
        invoiceCurrency: billingRecord.totalAmount.currency,
      });
    }

    assertCustomerPaymentApplicationsValid({
      currency,
      paymentAmount: input.amount,
      clientId: input.clientId,
      applications: applicationDetails,
    });

    const paymentAmount = money(input.amount, currency);
    const paymentDate = businessDate(input.paymentDate);

    // billingRecordId stays null so the 0039 1:1 trigger does not auto-apply.
    const insertedPaymentId = await insertPayment(tx, context.organizationId, {
      billingRecordId: null,
      clientId: input.clientId,
      amount: toNumericString(paymentAmount),
      currency,
      paymentDate,
      method: input.method?.trim() || null,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      createdByUserId: context.userId,
    });

    await lockPaymentForUpdate(tx, context.organizationId, insertedPaymentId);

    await insertPaymentApplications(
      tx,
      context.organizationId,
      applicationDetails.map((app) => ({
        paymentId: insertedPaymentId,
        billingRecordId: app.billingRecordId,
        appliedAmount: toNumericString(money(app.amount, currency)),
        currency,
      })),
    );

    return insertedPaymentId;
  });

  await recordAuditEvent(context, {
    action: PAYMENT_AUDIT_RECORDED,
    entityType: 'payment',
    entityId: paymentId,
    after: {
      clientId: input.clientId,
      billingRecordId: null,
      amount: toNumericString(money(input.amount, currency)),
      currency,
      paymentDate: businessDate(input.paymentDate),
      applications: input.applications.map((app) => ({
        billingRecordId: app.billingRecordId,
        amount: app.amount,
      })),
    },
  });

  const billingRecords = [];
  for (const app of input.applications) {
    const record = await findBillingRecordById(
      context.db,
      context.organizationId,
      app.billingRecordId,
      context.organization.timezone,
    );
    if (record) billingRecords.push(record);
  }

  return { paymentId, billingRecords };
}
