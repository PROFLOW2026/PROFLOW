/**
 * Vendor credit notes — create + apply.
 * Credits ≠ payments: they reduce outstanding AND Actual recognition.
 */

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findProjectById } from '@/modules/projects';
import {
  assertVendorInOrganization,
  findApBillById,
} from '../data/ap.repository';
import {
  creditRemaining,
  deriveCreditStatusAfterApplication,
  assertCreditApplicable,
  assertCreditCreatable,
  areApCreditsAvailable,
} from '../domain/vendor-credits';
import { computeBillOutstanding } from '../domain/vendor-payments';
import { getVendorPaymentsRepository } from '../data/payments.repository';
import {
  findVendorCreditById,
  insertCreditApplication,
  insertVendorCredit,
  listActiveAppliedAmountsForCredit,
  listActiveCreditAmountsForBill,
  listCreditApplicationsForBill,
  listVendorCreditsForOrg,
  lockVendorCreditForUpdate,
  updateVendorCreditStatus,
  type ApCreditApplicationRow,
  type ApVendorCreditRow,
} from '../data/credits.repository';
import {
  applyVendorCreditSchema,
  createVendorCreditSchema,
  type ApplyVendorCreditInput,
  type CreateVendorCreditInput,
} from '../validation/schemas';

function assertCreditsSchemaReady(): void {
  if (!areApCreditsAvailable()) {
    throw new DomainRuleError(
      'Vendor credits schema is not available yet',
      'ap.errors.creditsSchemaPending',
    );
  }
}

export async function listVendorCredits(
  context: OrgContext,
  options: { readonly vendorId?: string } = {},
): Promise<ApVendorCreditRow[]> {
  assertPermission(context, PERMISSIONS.AP_READ);
  if (!areApCreditsAvailable()) return [];
  return listVendorCreditsForOrg(context.db, context.organizationId, options);
}

export async function listCreditsForBill(
  context: OrgContext,
  billId: string,
): Promise<
  readonly {
    readonly application: ApCreditApplicationRow;
    readonly credit: ApVendorCreditRow;
  }[]
> {
  assertPermission(context, PERMISSIONS.AP_READ);
  if (!areApCreditsAvailable()) return [];
  const bill = await findApBillById(context.db, context.organizationId, billId);
  if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');
  return listCreditApplicationsForBill(context.db, context.organizationId, billId);
}

/**
 * Create an open vendor credit note (not a payment).
 * Optionally link to a bill / project for attribution defaults.
 */
export async function createVendorCredit(
  context: OrgContext,
  raw: CreateVendorCreditInput,
): Promise<ApVendorCreditRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  assertCreditsSchemaReady();

  const parsed = createVendorCreditSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const currency = input.currency.toUpperCase();
  assertCreditCreatable({ amount: input.amount, currency });

  const vendorOk = await assertVendorInOrganization(
    context.db,
    context.organizationId,
    input.vendorId,
  );
  if (!vendorOk) throw new NotFoundError('Vendor');

  if (input.projectId) {
    const project = await findProjectById(context.db, context.organizationId, input.projectId);
    if (!project || project.archivedAt) throw new NotFoundError('Project');
  }

  if (input.apBillId) {
    const bill = await findApBillById(context.db, context.organizationId, input.apBillId);
    if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');
    if (bill.vendorId !== input.vendorId) {
      throw new DomainRuleError(
        'Credit vendor must match the bill vendor',
        'ap.errors.vendorMismatch',
      );
    }
  }

  const credit = await insertVendorCredit(context.db, {
    organizationId: context.organizationId,
    vendorId: input.vendorId,
    apBillId: input.apBillId ?? null,
    projectId: input.projectId ?? null,
    reference: input.reference ?? null,
    creditDate: businessDate(input.creditDate),
    currency,
    amount: toNumericString(money(input.amount, currency)),
    status: 'open',
    notes: input.notes ?? null,
    createdByUserId: context.userId,
  });

  await noteModuleUsage(context.db, context.organizationId, 'procurement');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_CREDIT_CREATED,
    entityType: 'ap_vendor_credit',
    entityId: credit.id,
    after: {
      id: credit.id,
      amount: credit.amount,
      currency: credit.currency,
      isPayment: false,
      reducesActual: true,
    },
  });

  return credit;
}

/**
 * Apply credit to a payable bill.
 * Reduces outstanding and Actual; never recorded as a vendor payment.
 */
export async function applyVendorCredit(
  context: OrgContext,
  raw: ApplyVendorCreditInput,
): Promise<{
  credit: ApVendorCreditRow;
  application: ApCreditApplicationRow;
}> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  assertCreditsSchemaReady();

  const parsed = applyVendorCreditSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;

  const result = await withTransaction(context.db, async (tx) => {
    const paymentRepo = getVendorPaymentsRepository();
    await paymentRepo.lockBillsForUpdate(tx, context.organizationId, [input.apBillId]);

    const credit = await lockVendorCreditForUpdate(tx, context.organizationId, input.creditId);
    if (!credit) throw new NotFoundError('Vendor credit');

    const bill = await findApBillById(tx, context.organizationId, input.apBillId);
    if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');

    const priorCreditApps = await listActiveAppliedAmountsForCredit(
      tx,
      context.organizationId,
      credit.id,
    );
    const remaining = creditRemaining({
      creditAmount: credit.amount,
      appliedAmounts: priorCreditApps,
      currency: credit.currency,
    });

    const priorPayments = await paymentRepo.listActiveAppliedAmountsForBill(
      tx,
      context.organizationId,
      bill.id,
    );
    const priorCreditsOnBill = await listActiveCreditAmountsForBill(
      tx,
      context.organizationId,
      bill.id,
    );

    const outstanding = computeBillOutstanding({
      billStatus: bill.status,
      billTotal: money(bill.totalAmount, bill.currency),
      applications: priorPayments.map((amount) => ({
        appliedAmount: money(amount, bill.currency),
        paymentStatus: 'recorded' as const,
      })),
      creditApplications: priorCreditsOnBill.map((amount) => ({
        appliedAmount: money(amount, bill.currency),
        status: 'applied' as const,
      })),
    });

    assertCreditApplicable({
      creditStatus: credit.status as 'draft' | 'open' | 'applied' | 'void',
      creditCurrency: credit.currency,
      billStatus: bill.status,
      billCurrency: bill.currency,
      creditVendorId: credit.vendorId,
      billVendorId: bill.vendorId,
      applyAmount: input.amount,
      creditRemaining: remaining.amount,
      billOutstandingBeforeCredit: outstanding.amount,
    });

    const application = await insertCreditApplication(tx, {
      organizationId: context.organizationId,
      creditId: credit.id,
      apBillId: bill.id,
      amount: toNumericString(money(input.amount, bill.currency)),
      currency: bill.currency.toUpperCase(),
      createdByUserId: context.userId,
    });

    const nextStatus = deriveCreditStatusAfterApplication({
      creditAmount: credit.amount,
      priorAppliedAmounts: priorCreditApps,
      newApplicationAmount: input.amount,
      currency: credit.currency,
    });

    const updatedCredit =
      (await updateVendorCreditStatus(tx, context.organizationId, credit.id, nextStatus)) ??
      credit;

    return { credit: updatedCredit, application };
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_CREDIT_APPLIED,
    entityType: 'ap_credit_application',
    entityId: result.application.id,
    after: {
      creditId: result.credit.id,
      apBillId: result.application.apBillId,
      amount: result.application.amount,
      isPayment: false,
      reducesActual: true,
      reducesOutstanding: true,
    },
  });

  return result;
}

export async function getVendorCredit(
  context: OrgContext,
  creditId: string,
): Promise<ApVendorCreditRow | null> {
  assertPermission(context, PERMISSIONS.AP_READ);
  if (!areApCreditsAvailable()) return null;
  return findVendorCreditById(context.db, context.organizationId, creditId);
}
