import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { recordAuditEvent } from '@/shared/audit';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { isOrganizationOwner } from '@/shared/business-change/org-owner';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { money, toNumericString } from '@/shared/money';
import { assertRetentionFitsTotal } from '@/modules/retention';
import { resolveApplicableDefaultTax } from '@/modules/tax';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import {
  billingRecordHasIssuedStatutoryDocument,
  findBillingRecordById,
  findChangeOrdersWithNetInProject,
  replaceBillingLines,
  updateBillingRecordRow,
} from '../data/billing.repository';
import { listPaidAmountRowsByBillingRecordIds } from '../data/payments.repository';
import { buildNetBillingLines } from '../domain/billing-line-split';
import { assertFinalizeDueDateOrder } from '../domain/draft-rules';
import { isOverpaid } from '../domain/outstanding';
import { computeRecordRevenuePosition } from '../domain/revenue-position';
import {
  inferBillingVatModeForCapture,
  resolveTaxAmounts,
  taxAmountForStorage,
  type BillingVatMode,
} from '../domain/tax';
import {
  editFinalizedBillingRecordSchema,
  type EditFinalizedBillingRecordInput,
} from '../validation/schemas';

export async function editFinalizedBillingRecord(
  context: OrgContext,
  rawInput: EditFinalizedBillingRecordInput,
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  if (!isOrganizationOwner(context)) {
    throw new DomainRuleError(
      'Only the organization owner may correct finalized billing records',
      'billing.errors.ownerOnlyRetroactiveEdit',
    );
  }

  const parsed = editFinalizedBillingRecordSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findBillingRecordById(
    context.db,
    context.organizationId,
    input.billingRecordId,
    context.organization.timezone,
  );
  if (!existing) throw new NotFoundError('Billing record');
  if (existing.status !== 'finalized' || existing.voidsBillingRecordId) {
    throw new DomainRuleError(
      'Only finalized billing records can be corrected through this path',
      'billing.errors.notEditable',
      { status: existing.status },
    );
  }
  if (existing.kind === 'credit_note') {
    throw new DomainRuleError(
      'Credit notes must be corrected through the adjustment flow',
      'billing.errors.notEditable',
      { kind: existing.kind },
    );
  }

  const nextIssueDate = input.issueDate ? businessDate(input.issueDate) : existing.issueDate;
  const nextDueDate =
    input.dueDate === undefined
      ? existing.dueDate
      : input.dueDate
        ? businessDate(input.dueDate)
        : null;
  assertFinalizeDueDateOrder(nextIssueDate, nextDueDate);

  const hasStatutory = await billingRecordHasIssuedStatutoryDocument(
    context.db,
    context.organizationId,
    input.billingRecordId,
  );
  const touchesReference = input.reference !== undefined;
  const touchesNotes = input.notes !== undefined;
  const touchesIssue = input.issueDate !== undefined && input.issueDate !== existing.issueDate;
  const touchesDue =
    input.dueDate !== undefined &&
    (input.dueDate ?? null) !== (existing.dueDate ?? null);
  const amountFieldsTouched =
    input.amount !== undefined ||
    input.netAmount !== undefined ||
    input.taxAmount !== undefined ||
    input.vatMode !== undefined;

  if (!touchesIssue && !touchesDue && !touchesReference && !touchesNotes && !amountFieldsTouched) {
    throw new ValidationError([
      { path: 'billingRecordId', message: 'No business fields changed' },
    ]);
  }

  if (hasStatutory && (touchesReference || touchesNotes)) {
    throw new DomainRuleError(
      'When a statutory document was issued, only billing dates and amounts may be corrected internally',
      'billing.errors.statutoryDateOnlyCorrection',
      { billingRecordId: input.billingRecordId },
    );
  }

  const currency = existing.totalAmount.currency;
  const entryAmount =
    input.amount ??
    (existing.vatMode === 'inclusive'
      ? existing.totalAmount.amount
      : existing.subtotalAmount.amount);
  const vatModeForAmounts =
    input.vatMode ?? (existing.vatMode as BillingVatMode | null);
  const taxResolution =
    vatModeForAmounts != null
      ? await resolveApplicableDefaultTax(context, nextIssueDate)
      : null;
  const amounts = resolveTaxAmounts({
    amount: entryAmount,
    netAmount: input.netAmount,
    taxAmount: input.taxAmount,
    currency,
    vatMode: vatModeForAmounts,
    resolved: taxResolution?.resolved ?? null,
  });
  const vatModeStored: BillingVatMode | null =
    inferBillingVatModeForCapture({
      vatMode: input.vatMode ?? (existing.vatMode as BillingVatMode | null | undefined),
      netAmount: input.netAmount,
      taxAmount: input.taxAmount,
      resolvedTaxAmount: amounts.taxAmount,
    }) ?? (existing.vatMode as BillingVatMode | null);

  const amountsChanged =
    amounts.subtotalAmount.amount !== existing.subtotalAmount.amount ||
    amounts.totalAmount.amount !== existing.totalAmount.amount ||
    (amounts.taxAmount?.amount ?? '0') !== (existing.taxAmount?.amount ?? '0') ||
    (vatModeStored ?? null) !== (existing.vatMode ?? null);

  if (amountsChanged) {
    const paidRows = await listPaidAmountRowsByBillingRecordIds(context.db, context.organizationId, [
      input.billingRecordId,
    ]);
    const paymentInputs = paidRows
      .filter((row) => row.status === 'recorded')
      .map((row) => ({
        amount: money(row.amount, row.currency),
        amountBasis: row.amountBasis,
        status: row.status,
      }));
    const position = computeRecordRevenuePosition(
      {
        kind: existing.kind,
        status: 'finalized',
        totalAmount: amounts.totalAmount,
        subtotalAmount: amounts.subtotalAmount,
        taxAmount: amounts.taxAmount,
        payments: paymentInputs,
        retentionHeldRemaining: existing.retentionHeldRemaining ?? money('0', currency),
      },
      currency,
    );
    if (position && isOverpaid(position.open.net)) {
      throw new DomainRuleError(
        'Recorded payments exceed the corrected billing total',
        'billing.errors.paidExceedsNewTotal',
        { billingRecordId: input.billingRecordId },
      );
    }

    const retention = existing.retentionAmount ?? money('0', currency);
    assertRetentionFitsTotal(retention, amounts.totalAmount, 'ar');
  }

  const oldIssueMonth = yearMonthFromBusinessDate(existing.issueDate);
  const newIssueMonth = yearMonthFromBusinessDate(nextIssueDate);

  try {
    await assertMonthOpenForRewrite(context, oldIssueMonth);
    if (newIssueMonth !== oldIssueMonth) {
      await assertMonthOpenForRewrite(context, newIssueMonth);
    }

    if (amountFieldsTouched && amountsChanged) {
      const projectId = existing.projectId;
      if (!projectId) throw new NotFoundError('Project');

      const resolvedChangeOrderIds = existing.lines
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder)
        .map((line) => line.changeOrderId)
        .filter((id): id is string => id != null);

      const changeOrders =
        resolvedChangeOrderIds.length > 0
          ? await findChangeOrdersWithNetInProject(
              context.db,
              context.organizationId,
              projectId,
              resolvedChangeOrderIds,
            )
          : [];

      if (resolvedChangeOrderIds.length !== changeOrders.length) {
        throw new NotFoundError('Change order');
      }

      await replaceBillingLines(
        context.db,
        context.organizationId,
        input.billingRecordId,
        buildNetBillingLines({
          subtotal: amounts.subtotalAmount,
          changeOrders,
        }),
      );
    }

    await updateBillingRecordRow(context.db, context.organizationId, input.billingRecordId, {
      issueDate: touchesIssue ? nextIssueDate : undefined,
      dueDate: input.dueDate !== undefined ? nextDueDate : undefined,
      reference:
        input.reference === undefined ? undefined : input.reference?.trim() || null,
      notes: input.notes === undefined ? undefined : input.notes?.trim() || null,
      subtotalAmount: amountFieldsTouched ? toNumericString(amounts.subtotalAmount) : undefined,
      taxAmount: amountFieldsTouched
        ? taxAmountForStorage(vatModeStored, amounts.taxAmount, currency)
        : undefined,
      totalAmount: amountFieldsTouched ? toNumericString(amounts.totalAmount) : undefined,
      vatMode: amountFieldsTouched ? vatModeStored : undefined,
    });
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.BILLING_RECORD_UPDATED,
    entityType: 'billing_record',
    entityId: input.billingRecordId,
    before: {
      correctionKind: 'owner_retroactive',
      issueDate: existing.issueDate,
      dueDate: existing.dueDate,
      reference: existing.reference,
      notes: existing.notes,
      subtotalAmount: existing.subtotalAmount.amount,
      totalAmount: existing.totalAmount.amount,
      taxAmount: existing.taxAmount?.amount ?? null,
      vatMode: existing.vatMode,
      hasIssuedStatutoryDocument: hasStatutory,
    },
    after: {
      correctionKind: 'owner_retroactive',
      issueDate: nextIssueDate,
      dueDate: nextDueDate,
      reference: input.reference === undefined ? existing.reference : input.reference?.trim() || null,
      notes: input.notes === undefined ? existing.notes : input.notes?.trim() || null,
      subtotalAmount: amountFieldsTouched
        ? amounts.subtotalAmount.amount
        : existing.subtotalAmount.amount,
      totalAmount: amountFieldsTouched ? amounts.totalAmount.amount : existing.totalAmount.amount,
      taxAmount: amountFieldsTouched
        ? amounts.taxAmount?.amount ?? null
        : existing.taxAmount?.amount ?? null,
      vatMode: amountFieldsTouched ? vatModeStored : existing.vatMode,
      hasIssuedStatutoryDocument: hasStatutory,
    },
  });

  const updated = await findBillingRecordById(
    context.db,
    context.organizationId,
    input.billingRecordId,
    context.organization.timezone,
  );
  if (!updated) throw new NotFoundError('Billing record');
  return updated;
}
