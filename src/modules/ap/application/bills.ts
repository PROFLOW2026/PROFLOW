import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage, resolveAllocatedReference } from '@/modules/tenancy';
import { addMoney, money, moneyEquals, toNumericString, zeroMoney } from '@/shared/money';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { findProjectById } from '@/modules/projects';
import {
  assertMonthOpenForRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import {
  assertApprovalAllowsAction,
  findMatchingApprovalRule,
  submitApprovalRequest,
} from '@/modules/approvals';
import {
  computeCommittedAfterConsumption,
  findOpenCommittedCostForPo,
  updateCommittedCostConsumption,
} from '@/modules/procurement';
import {
  computeMatchVariance,
  remainingUnmatchedAmount,
  type MatchVariance,
} from '../domain/matching';
import { consumeAmountForPostedPoBill } from '../domain/vendor-cost-recognition';
import { resolveApBillTaxSplit } from '../domain/bill-tax';
import { resolveApplicableDefaultTax } from '@/modules/tax';
import {
  assertVendorInOrganization,
  findApBillById,
  findPurchaseOrderInOrg,
  findPurchaseOrderLineInOrg,
  insertApBill,
  insertApBillLines,
  listAcceptedMatchAmountsForBill,
  listApBillLines,
  listApBills,
  listApPoMatchesForBill,
  listReservedMatchAmountsForBill,
  updateApBillFields,
  type ApBillListItem,
  type ApBillLineRow,
  type ApBillRow,
  type ApPoMatchRow,
} from '../data/ap.repository';
import {
  heldRemainingOnPost,
  resolveRetentionCapture,
  updateDraftRetentionSchema,
} from '@/modules/retention';
import { createApBillSchema, type CreateApBillInput } from '../validation/schemas';
import {
  parsePaymentTermMetadata,
  resolveApPaymentTermId,
  suggestDueDateFromPaymentTerm,
  getCatalogEntryById,
  resolveOrgDefaultPaymentTermIdForContext,
} from '@/modules/business-catalog';
import { findVendorById, findSubcontractAgreementById } from '@/modules/vendors';

async function consumePoCommitmentForPostedBill(
  context: OrgContext,
  purchaseOrderId: string,
  billTotal: string,
): Promise<void> {
  const openCommitted = await findOpenCommittedCostForPo(
    context.db,
    context.organizationId,
    purchaseOrderId,
  );
  if (!openCommitted) return;
  const { consumeAmount } = consumeAmountForPostedPoBill({
    openCommitmentAmount: openCommitted.amount,
    billTotal,
    currency: openCommitted.currency,
  });
  const next = computeCommittedAfterConsumption({
    openAmount: openCommitted.amount,
    consumeAmount,
    currency: openCommitted.currency,
  });
  await updateCommittedCostConsumption(context.db, context.organizationId, openCommitted.id, {
    amount: next.remainingAmount,
    status: next.status,
  });
}

function assertBillTotalMatchesLines(input: {
  readonly currency: string;
  readonly totalAmount: string;
  readonly lines: readonly { readonly lineTotal: string; readonly currency: string }[];
}): void {
  const currency = input.currency.toUpperCase();
  let sum = zeroMoney(currency);
  for (const line of input.lines) {
    if (line.currency.toUpperCase() !== currency) {
      throw new DomainRuleError(
        'AP bill line currency must match the bill currency',
        'ap.errors.currencyMismatch',
      );
    }
    sum = addMoney(sum, money(line.lineTotal, currency));
  }
  if (!moneyEquals(sum, money(input.totalAmount, currency))) {
    throw new DomainRuleError(
      'Bill total must equal the sum of line totals',
      'ap.errors.totalMismatch',
    );
  }
}

export async function listApBillsForOrg(
  context: OrgContext,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<ApBillListItem[]> {
  assertPermission(context, PERMISSIONS.AP_READ);
  return listApBills(context.db, context.organizationId, options);
}

export async function getApBillDetail(
  context: OrgContext,
  billId: string,
): Promise<{
  bill: ApBillRow;
  lines: ApBillLineRow[];
  matches: ApPoMatchRow[];
  matchPosition: MatchVariance & { remainingIncludingProposed: string };
} | null> {
  assertPermission(context, PERMISSIONS.AP_READ);
  const bill = await findApBillById(context.db, context.organizationId, billId);
  if (!bill || bill.archivedAt) return null;

  const [lines, matches, acceptedAmounts, reservedAmounts] = await Promise.all([
    listApBillLines(context.db, context.organizationId, bill.id),
    listApPoMatchesForBill(context.db, context.organizationId, bill.id),
    listAcceptedMatchAmountsForBill(context.db, context.organizationId, bill.id),
    listReservedMatchAmountsForBill(context.db, context.organizationId, bill.id),
  ]);

  const variance = computeMatchVariance({
    currency: bill.currency,
    billTotal: bill.totalAmount,
    acceptedMatchedAmounts: acceptedAmounts,
  });

  const remainingIncludingProposed = remainingUnmatchedAmount({
    currency: bill.currency,
    billTotal: bill.totalAmount,
    reservedMatchedAmounts: reservedAmounts,
  });

  return {
    bill,
    lines,
    matches,
    matchPosition: {
      ...variance,
      remainingIncludingProposed: remainingIncludingProposed.amount,
    },
  };
}

/**
 * Creates a posted AP bill (status open). Does NOT create an Expense row.
 * Posted bills recognize Actual Vendor Cost in financials; payments remain cash-only.
 * When linked to a PO, consumes commitment by the bill total so Actual+Commitment
 * do not double-count before match accept.
 */
export async function createApBill(context: OrgContext, raw: CreateApBillInput) {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const parsed = createApBillSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  assertBillTotalMatchesLines({
    currency: input.currency,
    totalAmount: input.totalAmount,
    lines: input.lines,
  });

  const vendorOk = await assertVendorInOrganization(
    context.db,
    context.organizationId,
    input.vendorId,
  );
  if (!vendorOk) throw new NotFoundError('Vendor');

  const vendor = await findVendorById(context.db, context.organizationId, input.vendorId);

  const purchaseOrderId = input.purchaseOrderId ?? null;
  const subcontractAgreementId = input.subcontractAgreementId ?? null;

  let purchaseOrderTermId: string | null = null;
  let subcontractTermId: string | null = null;

  if (subcontractAgreementId) {
    const subcontract = await findSubcontractAgreementById(
      context.db,
      context.organizationId,
      subcontractAgreementId,
    );
    if (!subcontract) throw new NotFoundError('Subcontract');
    if (subcontract.vendorId !== input.vendorId) {
      throw new DomainRuleError(
        'Subcontract vendor must match the bill vendor',
        'ap.errors.vendorMismatch',
      );
    }
    subcontractTermId = subcontract.paymentTermId;
  }

  if (purchaseOrderId) {
    const po = await findPurchaseOrderInOrg(
      context.db,
      context.organizationId,
      purchaseOrderId,
    );
    if (!po) throw new NotFoundError('Purchase order');
    if (po.vendorId !== input.vendorId) {
      throw new DomainRuleError(
        'Purchase order vendor must match the bill vendor',
        'ap.errors.vendorMismatch',
      );
    }
    purchaseOrderTermId = po.paymentTermId ?? null;
  }

  const orgDefaultId = await resolveOrgDefaultPaymentTermIdForContext(context);
  const paymentTermId = resolveApPaymentTermId({
    explicitId: input.paymentTermId,
    subcontractTermId,
    purchaseOrderTermId,
    vendorDefaultId: vendor?.defaultPaymentTermId ?? null,
    orgDefaultId,
  });
  let paymentTermMeta = null;
  if (paymentTermId) {
    const termEntry = await getCatalogEntryById(
      context.db,
      context.organizationId,
      paymentTermId,
    );
    if (!termEntry || termEntry.kind !== 'payment_term' || !termEntry.isActive) {
      throw new NotFoundError('Payment term');
    }
    paymentTermMeta = parsePaymentTermMetadata(termEntry.metadata);
  }

  const billDate = businessDate(
    input.billDate ?? todayInTimeZone(context.organization.timezone),
  );
  const dueDateRaw = suggestDueDateFromPaymentTerm({
    baseDateIso: billDate,
    dueDate: input.dueDate,
    term: paymentTermMeta,
  });
  const dueDate = dueDateRaw ? businessDate(dueDateRaw) : null;
  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(billDate));

  const taxResolution = await resolveApplicableDefaultTax(context, billDate);
  const taxSplit = resolveApBillTaxSplit({
    enteredAmount: input.totalAmount,
    currency: input.currency,
    amountIncludesTax: input.amountIncludesTax,
    netAmount: input.netAmount,
    taxAmount: input.taxAmount,
    resolved: taxResolution.resolved,
  });

  let projectId = input.projectId ?? null;

  if (purchaseOrderId) {
    const po = await findPurchaseOrderInOrg(
      context.db,
      context.organizationId,
      purchaseOrderId,
    );
    if (!po) throw new NotFoundError('Purchase order');
    if (po.currency.toUpperCase() !== input.currency.toUpperCase()) {
      throw new DomainRuleError(
        'Purchase order currency must match the bill currency',
        'ap.errors.currencyMismatch',
      );
    }
    // Inherit project from PO when omitted so recognition lands on project financials.
    if (!projectId && po.projectId) {
      projectId = po.projectId;
    }
  }

  if (projectId) {
    const project = await findProjectById(context.db, context.organizationId, projectId);
    if (!project || project.archivedAt) throw new NotFoundError('Project');
  }

  for (const line of input.lines) {
    if (!line.purchaseOrderLineId) continue;
    const poLine = await findPurchaseOrderLineInOrg(
      context.db,
      context.organizationId,
      line.purchaseOrderLineId,
    );
    if (!poLine) throw new NotFoundError('Purchase order line');
    if (purchaseOrderId && poLine.purchaseOrderId !== purchaseOrderId) {
      throw new DomainRuleError(
        'Bill line purchase order line must belong to the selected purchase order',
        'ap.errors.poLineMismatch',
      );
    }
    const linePo = await findPurchaseOrderInOrg(
      context.db,
      context.organizationId,
      poLine.purchaseOrderId,
    );
    if (!linePo) throw new NotFoundError('Purchase order');
    if (linePo.vendorId !== input.vendorId) {
      throw new DomainRuleError(
        'Purchase order line vendor must match the bill vendor',
        'ap.errors.vendorMismatch',
      );
    }
    if (poLine.currency.toUpperCase() !== input.currency.toUpperCase()) {
      throw new DomainRuleError(
        'Purchase order line currency must match the bill currency',
        'ap.errors.currencyMismatch',
      );
    }
  }

  const matchingApproval = await findMatchingApprovalRule(context, {
    entityType: 'vendor_bill',
    amount: taxSplit.grossAmount,
    currency: input.currency.toUpperCase(),
  });
  const initialStatus = input.asDraft || matchingApproval ? 'draft' : 'open';

  const retention = resolveRetentionCapture({
    totalAmount: taxSplit.grossAmount,
    currency: input.currency,
    retentionAmount: input.retentionAmount,
    retentionPercent: input.retentionPercent,
    side: 'ap',
  });
  const retentionAmount = toNumericString(retention);
  const retentionHeldRemaining =
    initialStatus === 'open' ? heldRemainingOnPost(retention) : toNumericString(money('0', input.currency));

  const reference = await resolveAllocatedReference(context, 'vendor_bill', input.reference);
  const bill = await insertApBill(context.db, {
    organizationId: context.organizationId,
    vendorId: input.vendorId,
    projectId,
    purchaseOrderId,
    reference,
    status: initialStatus,
    billDate,
    dueDate,
    paymentTermId,
    currency: input.currency.toUpperCase(),
    totalAmount: taxSplit.totalAmount,
    netAmount: taxSplit.netAmount,
    taxAmount: taxSplit.taxAmount,
    grossAmount: taxSplit.grossAmount,
    amountIncludesTax: taxSplit.amountIncludesTax,
    taxSnapshot: taxSplit.taxSnapshot,
    taxBasis: taxSplit.taxBasis,
    retentionAmount,
    retentionHeldRemaining,
    subcontractAgreementId: input.subcontractAgreementId ?? null,
    notes: input.notes ?? null,
  });

  await insertApBillLines(
    context.db,
    input.lines.map((line, index) => ({
      organizationId: context.organizationId,
      apBillId: bill.id,
      description: line.description,
      quantity: line.quantity,
      unitAmount: line.unitAmount,
      lineTotal: line.lineTotal,
      currency: line.currency.toUpperCase(),
      purchaseOrderLineId: line.purchaseOrderLineId ?? null,
      sortOrder: index,
    })),
  );

  // Posted PO-linked bill → consume commitment by bill total (Actual recognition path).
  // Draft (awaiting approval) must NOT consume commitment or recognize Actual.
  if (purchaseOrderId && initialStatus === 'open') {
    await consumePoCommitmentForPostedBill(context, purchaseOrderId, bill.netAmount);
  }

  if (matchingApproval) {
    try {
      await submitApprovalRequest(context, {
        entityType: 'vendor_bill',
        entityId: bill.id,
        amount: bill.totalAmount,
        currency: bill.currency,
      });
    } catch {
      // Keep draft; poster uses postApBill → assertApprovalAllowsAction.
    }
  }

  await noteModuleUsage(context.db, context.organizationId, 'procurement');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_BILL_CREATED,
    entityType: 'ap_bill',
    entityId: bill.id,
    after: {
      id: bill.id,
      status: bill.status,
      totalAmount: bill.totalAmount,
      expenseCreated: false,
      recognizedVendorActual: initialStatus === 'open',
      awaitingApproval: Boolean(matchingApproval),
    },
  });

  return bill;
}

/**
 * Promote a draft vendor bill to open (Actual recognition).
 * Requires approval when an enabled vendor_bill rule matches.
 */
export async function postApBill(context: OrgContext, billId: string): Promise<ApBillRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const bill = await findApBillById(context.db, context.organizationId, billId);
  if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');
  if (bill.status !== 'draft') {
    throw new DomainRuleError(
      'Only draft vendor bills can be posted',
      'ap.errors.billNotDraft',
    );
  }

  const freezeDate =
    bill.billDate ?? bill.createdAt.toISOString().slice(0, 10);
  await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(freezeDate));

  await assertApprovalAllowsAction(context, {
    entityType: 'vendor_bill',
    entityId: bill.id,
    amount: bill.totalAmount,
    currency: bill.currency,
    submitIfMissing: true,
  });

  const updated = await updateApBillFields(context.db, context.organizationId, bill.id, {
    status: 'open',
    retentionHeldRemaining: bill.retentionAmount,
  });
  if (!updated) throw new NotFoundError('AP bill');

  if (updated.purchaseOrderId) {
    await consumePoCommitmentForPostedBill(context, updated.purchaseOrderId, updated.netAmount);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_BILL_CREATED,
    entityType: 'ap_bill',
    entityId: updated.id,
    after: {
      id: updated.id,
      status: updated.status,
      totalAmount: updated.totalAmount,
      recognizedVendorActual: true,
      postedFromDraft: true,
    },
  });

  return updated;
}

/**
 * Draft-only retention edit. Posted bills cannot increase retention;
 * releases are the only post-post path that changes held remaining.
 */
export async function updateDraftApBillRetention(
  context: OrgContext,
  raw: { billId: string; retentionAmount?: string | null; retentionPercent?: string | null },
): Promise<ApBillRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const parsed = updateDraftRetentionSchema.safeParse({
    sourceId: raw.billId,
    retentionAmount: raw.retentionAmount,
    retentionPercent: raw.retentionPercent,
  });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const bill = await findApBillById(context.db, context.organizationId, parsed.data.sourceId);
  if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');
  if (bill.status !== 'draft') {
    throw new DomainRuleError(
      'Recognized vendor bills cannot be silently edited; void and replace, or apply a credit',
      'ap.errors.billNotSilentlyEditable',
    );
  }

  const retention = resolveRetentionCapture({
    totalAmount: bill.totalAmount,
    currency: bill.currency,
    retentionAmount: parsed.data.retentionAmount,
    retentionPercent: parsed.data.retentionPercent,
    side: 'ap',
  });

  const updated = await updateApBillFields(context.db, context.organizationId, bill.id, {
    retentionAmount: toNumericString(retention),
    retentionHeldRemaining: toNumericString(money('0', bill.currency)),
  });
  if (!updated) throw new NotFoundError('AP bill');
  return updated;
}

/**
 * Always-draft vendor bill. Recognizes NO Actual and consumes NO commitment
 * until `postApBill`. Safe for OCR and BOQ subcontractor handoff.
 */
export async function createDraftApBill(
  context: OrgContext,
  raw: CreateApBillInput,
): Promise<ApBillRow> {
  return createApBill(context, { ...raw, asDraft: true });
}
