import { recordAuditEvent } from '@/shared/audit';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { withTransaction } from '@/shared/db';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { findBillingRecordById } from '../data/billing.repository';
import {
  findPaymentById,
  insertPaymentApplications,
  listActiveAppliedAmountsForBillingRecord,
  listActiveAppliedAmountsForPayment,
  lockBillingRecordsForUpdate,
  lockPaymentForUpdate,
} from '../data/payments.repository';
import { assertAdditionalCustomerPaymentApplicationsValid } from '../domain/payment-applications';
import {
  allocateCustomerPaymentSchema,
  type AllocateCustomerPaymentInput,
} from '../validation/schemas';

/**
 * Allocate remaining unallocated cash on an existing customer payment onto
 * finalized invoices. Does not change cash received / payment date / revenue.
 */
export async function allocateCustomerPayment(
  context: OrgContext,
  rawInput: AllocateCustomerPaymentInput,
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const parsed = allocateCustomerPaymentSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const billIds = input.applications.map((app) => app.billingRecordId);

  const result = await withTransaction(context.db, async (tx) => {
    await lockPaymentForUpdate(tx, context.organizationId, input.paymentId);
    const payment = await findPaymentById(tx, context.organizationId, input.paymentId);
    if (!payment) throw new NotFoundError('Payment');
    if (payment.status !== 'recorded') {
      throw new DomainRuleError(
        'Only recorded payments can receive allocations',
        'billing.errors.paymentNotVoidable',
      );
    }
    if (!payment.clientId) {
      throw new DomainRuleError(
        'Payment client is required for allocation',
        'billing.errors.paymentClientMismatch',
      );
    }

    const currency = payment.currency.toUpperCase();
    const alreadyApplied = await listActiveAppliedAmountsForPayment(
      tx,
      context.organizationId,
      payment.id,
    );

    await lockBillingRecordsForUpdate(tx, context.organizationId, billIds);

    const applicationDetails = [];
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

    assertAdditionalCustomerPaymentApplicationsValid({
      currency,
      paymentAmount: payment.amount,
      alreadyAppliedAmounts: alreadyApplied,
      clientId: payment.clientId,
      applications: applicationDetails,
    });

    await insertPaymentApplications(
      tx,
      context.organizationId,
      applicationDetails.map((app) => ({
        paymentId: payment.id,
        billingRecordId: app.billingRecordId,
        appliedAmount: toNumericString(money(app.amount, currency)),
        currency,
      })),
    );

    return {
      paymentId: payment.id,
      clientId: payment.clientId,
      currency,
      paymentAmount: payment.amount,
      applications: applicationDetails.map((app) => ({
        billingRecordId: app.billingRecordId,
        amount: app.amount,
      })),
    };
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PAYMENT_ALLOCATED,
    entityType: 'payment',
    entityId: result.paymentId,
    after: {
      clientId: result.clientId,
      applications: result.applications,
    },
  });

  const billingRecords = [];
  for (const app of result.applications) {
    const record = await findBillingRecordById(
      context.db,
      context.organizationId,
      app.billingRecordId,
      context.organization.timezone,
    );
    if (record) billingRecords.push(record);
  }

  return { paymentId: result.paymentId, billingRecords };
}
