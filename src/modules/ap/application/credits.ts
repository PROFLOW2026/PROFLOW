/**
 * Vendor credit notes — create, draft-edit, post, apply, void.
 * Credits ≠ payments: they reduce outstanding AND Actual recognition.
 * No silent post. No hard delete after posting.
 */

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { money, moneyEquals, subtractMoney, toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findProjectById } from '@/modules/projects';
import {
  assertMonthOpenForRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import {
  assertApprovalAllowsAction,
  findMatchingApprovalRule,
  getLatestApprovalForEntity,
  submitApprovalRequest,
} from '@/modules/approvals';
import {
  assertVendorInOrganization,
  findApBillById,
} from '../data/ap.repository';
import {
  creditRemaining,
  deriveCreditStatusAfterApplication,
  displayCreditLifecycleStatus,
  assertCreditApplicable,
  assertCreditCreatable,
  assertCreditDraftEditable,
  assertCreditVoidable,
  areApCreditsAvailable,
  type ApCreditLifecycleDisplayStatus,
} from '../domain/vendor-credits';
import { computeBillOutstanding } from '../domain/vendor-payments';
import { getVendorPaymentsRepository } from '../data/payments.repository';
import {
  findVendorCreditById,
  findVendorCreditWithVendor,
  insertCreditApplication,
  insertVendorCredit,
  listActiveAppliedAmountsForCredit,
  listActiveCreditAmountsForBill,
  listCreditApplicationsForBill,
  listCreditApplicationsForCredit,
  listVendorCreditsForOrg,
  lockVendorCreditForUpdate,
  updateVendorCreditDraftFields,
  updateVendorCreditStatus,
  voidCreditApplication,
  type ApCreditApplicationRow,
  type ApCreditApplicationWithBill,
  type ApVendorCreditListItem,
  type ApVendorCreditRow,
} from '../data/credits.repository';
import {
  applyVendorCreditSchema,
  createVendorCreditSchema,
  updateVendorCreditDraftSchema,
  voidVendorCreditSchema,
  type ApplyVendorCreditInput,
  type CreateVendorCreditInput,
  type UpdateVendorCreditDraftInput,
  type VoidVendorCreditInput,
} from '../validation/schemas';

function assertCreditsSchemaReady(): void {
  if (!areApCreditsAvailable()) {
    throw new DomainRuleError(
      'Vendor credits schema is not available yet',
      'ap.errors.creditsSchemaPending',
    );
  }
}

export type ApVendorCreditListView = ApVendorCreditListItem & {
  readonly displayStatus: ApCreditLifecycleDisplayStatus;
};

export async function listVendorCredits(
  context: OrgContext,
  options: { readonly vendorId?: string } = {},
): Promise<ApVendorCreditListView[]> {
  assertPermission(context, PERMISSIONS.AP_READ);
  if (!areApCreditsAvailable()) return [];
  const rows = await listVendorCreditsForOrg(context.db, context.organizationId, options);
  const draftIds = rows.filter((row) => row.status === 'draft').map((row) => row.id);
  const approvalByCreditId = new Map<string, string | null>();
  await Promise.all(
    draftIds.map(async (creditId) => {
      const latest = await getLatestApprovalForEntity(context, 'vendor_credit', creditId);
      approvalByCreditId.set(creditId, latest?.status ?? null);
    }),
  );

  return rows.map((row) => ({
    ...row,
    displayStatus: displayCreditLifecycleStatus({
      creditStatus: row.status as 'draft' | 'open' | 'applied' | 'void',
      approvalRequestStatus: row.status === 'draft' ? (approvalByCreditId.get(row.id) ?? null) : null,
    }),
  }));
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

  const matchingApproval = await findMatchingApprovalRule(context, {
    entityType: 'vendor_credit',
    amount: toNumericString(money(input.amount, currency)),
    currency,
  });

  const credit = await insertVendorCredit(context.db, {
    organizationId: context.organizationId,
    vendorId: input.vendorId,
    apBillId: input.apBillId ?? null,
    projectId: input.projectId ?? null,
    reference: input.reference ?? null,
    creditDate: businessDate(input.creditDate),
    currency,
    amount: toNumericString(money(input.amount, currency)),
    status: 'draft',
    notes: input.notes ?? null,
    createdByUserId: context.userId,
  });

  if (matchingApproval) {
    try {
      await submitApprovalRequest(context, {
        entityType: 'vendor_credit',
        entityId: credit.id,
        amount: credit.amount,
        currency: credit.currency,
      });
    } catch {
      // Keep draft until postVendorCredit.
    }
  }

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
      reducesActual: false,
      awaitingApproval: Boolean(matchingApproval),
    },
  });

  return credit;
}

/**
 * Promote draft vendor credit to open (reduces Actual when applied).
 * Open credits are recognized; draft credits are not.
 */
export async function postVendorCredit(context: OrgContext, creditId: string) {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  assertCreditsSchemaReady();

  const credit = await findVendorCreditById(context.db, context.organizationId, creditId);
  if (!credit || credit.archivedAt) throw new NotFoundError('Vendor credit');
  if (credit.status !== 'draft') {
    throw new DomainRuleError(
      'Only draft vendor credits can be posted',
      'ap.errors.creditNotDraft',
    );
  }

  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(credit.creditDate));

  await assertApprovalAllowsAction(context, {
    entityType: 'vendor_credit',
    entityId: credit.id,
    amount: credit.amount,
    currency: credit.currency,
    submitIfMissing: true,
  });

  const updated = await updateVendorCreditStatus(
    context.db,
    context.organizationId,
    credit.id,
    'open',
  );
  if (!updated) throw new NotFoundError('Vendor credit');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_CREDIT_POSTED,
    entityType: 'ap_vendor_credit',
    entityId: updated.id,
    after: {
      id: updated.id,
      amount: updated.amount,
      currency: updated.currency,
      status: updated.status,
      reducesActual: true,
      postedFromDraft: true,
    },
  });

  return updated;
}

/**
 * Edit amount / date / notes / reference while the credit is still draft.
 * Open / applied / void credits are immutable — void + replace is the correction path.
 */
export async function updateVendorCredit(
  context: OrgContext,
  raw: UpdateVendorCreditDraftInput,
): Promise<ApVendorCreditRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  assertCreditsSchemaReady();

  const parsed = updateVendorCreditDraftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findVendorCreditById(context.db, context.organizationId, input.creditId);
  if (!existing || existing.archivedAt) throw new NotFoundError('Vendor credit');
  assertCreditDraftEditable(existing.status as 'draft' | 'open' | 'applied' | 'void');
  assertCreditCreatable({ amount: input.amount, currency: existing.currency });

  const amountChanged = !moneyEquals(
    money(existing.amount, existing.currency),
    money(input.amount, existing.currency),
  );
  const dateChanged =
    businessDate(input.creditDate) !== businessDate(existing.creditDate);
  if (amountChanged || dateChanged) {
    const latest = await getLatestApprovalForEntity(context, 'vendor_credit', existing.id);
    if (latest?.status === 'submitted') {
      throw new DomainRuleError(
        'Amount and date are locked while approval is pending. Cancel the request or wait for a decision.',
        'ap.errors.creditLockedPendingApproval',
      );
    }
  }

  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(input.creditDate));

  const updated = await updateVendorCreditDraftFields(
    context.db,
    context.organizationId,
    existing.id,
    {
      amount: toNumericString(money(input.amount, existing.currency)),
      creditDate: businessDate(input.creditDate),
      reference: input.reference ?? null,
      notes: input.notes ?? null,
    },
  );
  if (!updated) throw new NotFoundError('Vendor credit');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_CREDIT_UPDATED,
    entityType: 'ap_vendor_credit',
    entityId: updated.id,
    before: {
      amount: existing.amount,
      creditDate: existing.creditDate,
      reference: existing.reference,
      notes: existing.notes,
    },
    after: {
      amount: updated.amount,
      creditDate: updated.creditDate,
      reference: updated.reference,
      notes: updated.notes,
      status: updated.status,
    },
  });

  return updated;
}

/**
 * Void a vendor credit. No hard delete.
 * Active applications are unwound first so outstanding and Actual are restored.
 * Application rows remain with status void.
 */
export async function voidVendorCredit(
  context: OrgContext,
  raw: VoidVendorCreditInput,
): Promise<ApVendorCreditRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);
  assertCreditsSchemaReady();

  const parsed = voidVendorCreditSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const preview = await findVendorCreditById(
    context.db,
    context.organizationId,
    parsed.data.creditId,
  );
  if (!preview || preview.archivedAt) throw new NotFoundError('Vendor credit');
  assertCreditVoidable({ creditStatus: preview.status as 'draft' | 'open' | 'applied' | 'void' });
  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(preview.creditDate));

  const voidedAt = new Date();
  const voided = await withTransaction(context.db, async (tx) => {
    const paymentRepo = getVendorPaymentsRepository();
    const credit = await lockVendorCreditForUpdate(tx, context.organizationId, parsed.data.creditId);
    if (!credit) throw new NotFoundError('Vendor credit');
    assertCreditVoidable({ creditStatus: credit.status as 'draft' | 'open' | 'applied' | 'void' });

    const applications = await listCreditApplicationsForCredit(
      tx,
      context.organizationId,
      credit.id,
    );
    const active = applications.filter((row) => row.application.status === 'applied');
    const billIds = [...new Set(active.map((row) => row.application.apBillId))];
    if (billIds.length > 0) {
      await paymentRepo.lockBillsForUpdate(tx, context.organizationId, billIds);
    }

    for (const row of active) {
      const unwound = await voidCreditApplication(
        tx,
        context.organizationId,
        row.application.id,
        voidedAt,
      );
      if (!unwound) throw new NotFoundError('Credit application');
    }

    const updated = await updateVendorCreditStatus(
      tx,
      context.organizationId,
      credit.id,
      'void',
      voidedAt,
    );
    if (!updated) throw new NotFoundError('Vendor credit');
    return { before: credit, after: updated, unwoundCount: active.length };
  });

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_CREDIT_VOIDED,
    entityType: 'ap_vendor_credit',
    entityId: voided.after.id,
    before: { status: voided.before.status, amount: voided.before.amount },
    after: {
      status: voided.after.status,
      voidedAt: voidedAt.toISOString(),
      applicationsUnwound: voided.unwoundCount,
      hardDeleted: false,
      reducesActual: false,
    },
  });

  return voided.after;
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

  const billForFreeze = await findApBillById(
    context.db,
    context.organizationId,
    input.apBillId,
  );
  if (!billForFreeze || billForFreeze.archivedAt) throw new NotFoundError('AP bill');
  const freezeDate =
    billForFreeze.billDate ?? billForFreeze.createdAt.toISOString().slice(0, 10);
  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(freezeDate));

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
      retentionHeldRemaining: money(bill.retentionHeldRemaining, bill.currency),
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

export async function getVendorCreditDetail(
  context: OrgContext,
  creditId: string,
): Promise<{
  credit: ApVendorCreditListItem;
  applications: readonly ApCreditApplicationWithBill[];
  remaining: string;
  appliedTotal: string;
  displayStatus: ApCreditLifecycleDisplayStatus;
  approvalRequestStatus: string | null;
} | null> {
  assertPermission(context, PERMISSIONS.AP_READ);
  if (!areApCreditsAvailable()) return null;

  const credit = await findVendorCreditWithVendor(context.db, context.organizationId, creditId);
  if (!credit) return null;

  const applications = await listCreditApplicationsForCredit(
    context.db,
    context.organizationId,
    credit.id,
  );
  const activeAmounts = applications
    .filter((row) => row.application.status === 'applied')
    .map((row) => row.application.amount);
  const remaining = creditRemaining({
    creditAmount: credit.amount,
    appliedAmounts: activeAmounts,
    currency: credit.currency,
  });
  const appliedTotal = subtractMoney(
    money(credit.amount, credit.currency),
    remaining,
  ).amount;

  let approvalRequestStatus: string | null = null;
  if (credit.status === 'draft') {
    const latest = await getLatestApprovalForEntity(context, 'vendor_credit', credit.id);
    approvalRequestStatus = latest?.status ?? null;
  }

  return {
    credit,
    applications,
    remaining: remaining.amount,
    appliedTotal,
    displayStatus: displayCreditLifecycleStatus({
      creditStatus: credit.status as 'draft' | 'open' | 'applied' | 'void',
      approvalRequestStatus,
    }),
    approvalRequestStatus,
  };
}
