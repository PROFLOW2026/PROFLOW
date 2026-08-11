/**
 * Vendor payment application services.
 * Cash / AP only — never recognizes Actual Cost.
 *
 * Financial immutability:
 * - No delete of payments or applications.
 * - No rewrite of amount / currency / paymentDate / vendorId / applications.
 * - Correction = void old payment + record a new one.
 * - Optional metadata edits: method / reference / notes on recorded payments only.
 */

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { addMoney, money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  assertVendorInOrganization,
  findApBillById,
} from '../data/ap.repository';
import { listActiveCreditAmountsForBill } from '../data/credits.repository';
import {
  getVendorPaymentsRepository,
  type ApPaymentApplicationRow,
  type ApPaymentRow,
  type ApPaymentWithApplications,
} from '../data/payments.repository';
import {
  areApPaymentsAvailable,
  assertApPaymentCurrencyMatch,
  assertPaymentApplicationNotMutable,
  assertPaymentApplicationsValid,
  assertPaymentFinancialFieldsImmutable,
  assertPaymentMetadataEditable,
  assertPaymentNotDeletable,
  assertPaymentVoidable,
  assertVendorPaymentDoesNotAffectActual,
  computeBillOutstanding,
  derivePayableStatus,
  sumActiveAppliedAmounts,
  type ApPayableStatus,
} from '../domain/vendor-payments';
import {
  recordVendorPaymentSchema,
  updateVendorPaymentMetadataSchema,
  voidVendorPaymentSchema,
  type RecordVendorPaymentInput,
  type UpdateVendorPaymentMetadataInput,
} from '../validation/schemas';

function assertPaymentsSchemaReady(): void {
  if (!areApPaymentsAvailable()) {
    throw new DomainRuleError(
      'Vendor payments schema is not available yet',
      'ap.errors.paymentsSchemaPending',
    );
  }
}

export async function getBillPayablePosition(
  context: OrgContext,
  billId: string,
): Promise<{
  billId: string;
  currency: string;
  billTotal: string;
  paid: string;
  credited: string;
  outstanding: string;
  retentionAmount: string;
  retentionHeldRemaining: string;
  payableStatus: ApPayableStatus | null;
  paymentsAvailable: boolean;
} | null> {
  assertPermission(context, PERMISSIONS.AP_READ);

  const bill = await findApBillById(context.db, context.organizationId, billId);
  if (!bill || bill.archivedAt) return null;

  const repo = getVendorPaymentsRepository();
  const [applied, credits] = await Promise.all([
    repo.listActiveAppliedAmountsForBill(context.db, context.organizationId, bill.id),
    listActiveCreditAmountsForBill(context.db, context.organizationId, bill.id),
  ]);

  const billTotal = money(bill.totalAmount, bill.currency);
  const applications = applied.map((amount) => ({
    appliedAmount: money(amount, bill.currency),
    paymentStatus: 'recorded' as const,
  }));
  const creditApplications = credits.map((amount) => ({
    appliedAmount: money(amount, bill.currency),
    status: 'applied' as const,
  }));

  const retentionHeldRemaining = money(bill.retentionHeldRemaining, bill.currency);
  const outstanding = computeBillOutstanding({
    billStatus: bill.status,
    billTotal,
    applications,
    creditApplications,
    retentionHeldRemaining,
  });
  const creditedTotal = credits.reduce(
    (sum, amount) => addMoney(sum, money(amount, bill.currency)),
    money('0', bill.currency),
  );
  const paid = sumActiveAppliedAmounts(applications, bill.currency);

  return {
    billId: bill.id,
    currency: bill.currency,
    billTotal: bill.totalAmount,
    paid: paid.amount,
    credited: creditedTotal.amount,
    outstanding: outstanding.amount,
    retentionAmount: bill.retentionAmount,
    retentionHeldRemaining: bill.retentionHeldRemaining,
    payableStatus: derivePayableStatus({
      billStatus: bill.status,
      billTotal,
      applications,
      creditApplications,
      retentionHeldRemaining,
    }),
    paymentsAvailable: areApPaymentsAvailable(),
  };
}

export async function listVendorPaymentsForBill(
  context: OrgContext,
  billId: string,
): Promise<readonly ApPaymentWithApplications[]> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const bill = await findApBillById(context.db, context.organizationId, billId);
  if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');

  return getVendorPaymentsRepository().listPaymentsForBill(
    context.db,
    context.organizationId,
    billId,
  );
}

/**
 * Records a vendor payment header + applications.
 * Does NOT change Actual Cost / vendor recognition.
 *
 * Concurrency: locks target bills with SELECT FOR UPDATE inside withTransaction,
 * then re-validates outstanding / currency / vendor before insert.
 */
export async function recordVendorPayment(
  context: OrgContext,
  raw: RecordVendorPaymentInput,
): Promise<{ payment: ApPaymentRow; applications: readonly ApPaymentApplicationRow[] }> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  assertPaymentsSchemaReady();
  assertVendorPaymentDoesNotAffectActual();

  const parsed = recordVendorPaymentSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const currency = input.currency.toUpperCase();
  const repo = getVendorPaymentsRepository();
  const billIds = input.applications.map((app) => app.apBillId);

  const { payment, applications, vendorId, applicationDetails } = await withTransaction(
    context.db,
    async (tx) => {
      await repo.lockBillsForUpdate(tx, context.organizationId, billIds);

      const applicationDetails: {
        apBillId: string;
        appliedAmount: string;
        billStatus: string;
        billTotal: string;
        priorAppliedAmounts: readonly string[];
        priorCreditAmounts: readonly string[];
        priorRetentionHeldRemaining: string;
        projectId: string | null;
      }[] = [];

      let vendorId: string | null = input.vendorId ?? null;

      if (vendorId) {
        const vendorOk = await assertVendorInOrganization(
          tx,
          context.organizationId,
          vendorId,
        );
        if (!vendorOk) throw new NotFoundError('Vendor');
      }

      for (const app of input.applications) {
        const bill = await findApBillById(tx, context.organizationId, app.apBillId);
        if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');

        assertApPaymentCurrencyMatch(currency, bill.currency);

        if (vendorId && bill.vendorId !== vendorId) {
          throw new DomainRuleError(
            'All applications must share the payment vendor',
            'ap.errors.paymentVendorMismatch',
          );
        }
        vendorId = bill.vendorId;

        const prior = await repo.listActiveAppliedAmountsForBill(
          tx,
          context.organizationId,
          bill.id,
        );
        const priorCredits = await listActiveCreditAmountsForBill(
          tx,
          context.organizationId,
          bill.id,
        );

        applicationDetails.push({
          apBillId: bill.id,
          appliedAmount: app.appliedAmount,
          billStatus: bill.status,
          billTotal: bill.totalAmount,
          priorAppliedAmounts: prior,
          priorCreditAmounts: priorCredits,
          priorRetentionHeldRemaining: bill.retentionHeldRemaining,
          projectId: bill.projectId,
        });
      }

      if (!vendorId) {
        throw new DomainRuleError('Payment requires a vendor', 'ap.errors.vendorRequired');
      }

      const vendorOk = await assertVendorInOrganization(
        tx,
        context.organizationId,
        vendorId,
      );
      if (!vendorOk) throw new NotFoundError('Vendor');

      assertPaymentApplicationsValid({
        currency,
        paymentAmount: input.amount,
        applications: applicationDetails,
      });

      const paymentDate = businessDate(input.paymentDate);
      const paymentAmount = money(input.amount, currency);

      const insertedPayment = await repo.insertPayment(tx, {
        organizationId: context.organizationId,
        vendorId,
        amount: toNumericString(paymentAmount),
        currency,
        paymentDate,
        method: input.method?.trim() || null,
        reference: input.reference?.trim() || null,
        notes: input.notes?.trim() || null,
        createdByUserId: context.userId,
      });

      // Lock the new payment before applications (allocation invariant under concurrency).
      await repo.lockPaymentForUpdate(tx, context.organizationId, insertedPayment.id);

      const insertedApplications = await repo.insertApplications(
        tx,
        applicationDetails.map((app) => ({
          organizationId: context.organizationId,
          apPaymentId: insertedPayment.id,
          apBillId: app.apBillId,
          appliedAmount: toNumericString(money(app.appliedAmount, currency)),
          currency,
        })),
      );

      return {
        payment: insertedPayment,
        applications: insertedApplications,
        vendorId,
        applicationDetails,
      };
    },
  );

  await noteModuleUsage(context.db, context.organizationId, 'procurement');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_PAYMENT_RECORDED,
    entityType: 'ap_payment',
    entityId: payment.id,
    after: {
      id: payment.id,
      vendorId,
      amount: payment.amount,
      currency: payment.currency,
      paymentDate: payment.paymentDate,
      applications: applications.map((a) => ({
        apBillId: a.apBillId,
        appliedAmount: a.appliedAmount,
        projectId:
          applicationDetails.find((d) => d.apBillId === a.apBillId)?.projectId ?? null,
      })),
      affectsActualCost: false,
    },
  });

  return { payment, applications };
}

export async function voidVendorPayment(
  context: OrgContext,
  paymentId: string,
): Promise<ApPaymentRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  assertPaymentsSchemaReady();
  assertVendorPaymentDoesNotAffectActual();

  const parsed = voidVendorPaymentSchema.safeParse({ paymentId });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const repo = getVendorPaymentsRepository();
  const voidedAt = new Date();

  const voided = await withTransaction(context.db, async (tx) => {
    const locked = await repo.lockPaymentForUpdate(
      tx,
      context.organizationId,
      parsed.data.paymentId,
    );
    if (!locked) throw new NotFoundError('Vendor payment');
    assertPaymentVoidable(locked.status);

    // Applications remain; voided payment status excludes them from outstanding.
    const updated = await repo.voidPayment(
      tx,
      context.organizationId,
      locked.id,
      voidedAt,
    );
    if (!updated) throw new NotFoundError('Vendor payment');
    return updated;
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_PAYMENT_VOIDED,
    entityType: 'ap_payment',
    entityId: voided.id,
    before: { status: 'recorded' },
    after: { status: 'void', voidedAt: voidedAt.toISOString(), affectsActualCost: false },
  });

  return voided;
}

/**
 * Optional non-financial metadata update (method / reference / notes).
 * Amount, currency, paymentDate, vendorId, and applications stay immutable.
 */
export async function updateVendorPaymentMetadata(
  context: OrgContext,
  raw: UpdateVendorPaymentMetadataInput,
): Promise<ApPaymentRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  assertPaymentsSchemaReady();

  const parsed = updateVendorPaymentMetadataSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  // Explicitly document: financial rewrite attempts are rejected at the domain gate.
  assertPaymentFinancialFieldsImmutable({});

  const repo = getVendorPaymentsRepository();
  const updated = await withTransaction(context.db, async (tx) => {
    const locked = await repo.lockPaymentForUpdate(
      tx,
      context.organizationId,
      parsed.data.paymentId,
    );
    if (!locked) throw new NotFoundError('Vendor payment');
    assertPaymentMetadataEditable(locked.status);

    const next = await repo.updatePaymentMetadata(tx, context.organizationId, locked.id, {
      method:
        parsed.data.method !== undefined
          ? parsed.data.method?.trim() || null
          : undefined,
      reference:
        parsed.data.reference !== undefined
          ? parsed.data.reference?.trim() || null
          : undefined,
      notes:
        parsed.data.notes !== undefined ? parsed.data.notes?.trim() || null : undefined,
    });
    if (!next) throw new NotFoundError('Vendor payment');
    return next;
  });

  return updated;
}

/** Hard-delete is forbidden — always throws. */
export async function deleteVendorPayment(
  _context: OrgContext,
  _paymentId: string,
): Promise<never> {
  assertPermission(_context, PERMISSIONS.AP_MANAGE);
  assertPaymentNotDeletable();
}

/** Application rewrite / delete is forbidden — always throws. */
export function rejectPaymentApplicationMutation(): never {
  assertPaymentApplicationNotMutable();
}
