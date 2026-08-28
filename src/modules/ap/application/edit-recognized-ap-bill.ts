/**
 * Direct correction of recognized AP bills in open months (0071).
 */

import { randomUUID } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { INTERNAL_FINANCIAL_EDIT_LATCH } from '@/shared/db/financial-latch-kinds';
import { withTrustedFinancialLatch } from '@/shared/db/trusted-financial-latch';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import { resolveApplicableDefaultTax } from '@/modules/tax';
import { findProjectById } from '@/modules/projects';
import { findCostCategoryById } from '@/modules/expenses';
import {
  isDeprecatedForNewTransactionEntry,
  resolveApClassificationStatus,
} from '@/modules/financials/domain/economic-classification';
import { findVendorById } from '@/modules/vendors';
import {
  deleteApBillLinesNotIn,
  findApBillById,
  insertApBillLines,
  listApBillLines,
  updateApBillFields,
  updateApBillLine,
  type ApBillRow,
} from '../data/ap.repository';
import { resolveApBillTaxSplit } from '../domain/bill-tax';
import {
  allocateApLineMonetarySplits,
  assertApLineNetConservesBill,
} from '../domain/bill-line-monetary';
import { isRecognizedVendorBillStatus } from '../domain/vendor-cost-recognition';
import { getVendorPaymentsRepository } from '../data/payments.repository';
import { listActiveCreditAmountsForBill } from '../data/credits.repository';
import { editRecognizedApBillSchema, type EditRecognizedApBillInput } from '../validation/schemas';

function assertBillTotalMatchesLines(input: {
  readonly currency: string;
  readonly totalAmount: string;
  readonly lines: readonly { readonly lineTotal: string; readonly currency: string }[];
}): void {
  const currency = input.currency.toUpperCase();
  let sum = '0';
  for (const line of input.lines) {
    if (line.currency.toUpperCase() !== currency) {
      throw new DomainRuleError(
        'AP bill line currency must match the bill currency',
        'ap.errors.currencyMismatch',
      );
    }
    sum = (Number(sum) + Number(line.lineTotal)).toFixed(6);
  }
  if (Number(sum).toFixed(2) !== Number(input.totalAmount).toFixed(2)) {
    throw new DomainRuleError(
      'Bill total must equal the sum of line totals',
      'ap.errors.totalMismatch',
    );
  }
}

function sumAppliedSettlements(
  paymentAmounts: readonly string[],
  creditAmounts: readonly string[],
): number {
  let sum = 0;
  for (const amount of paymentAmounts) sum += Number(amount);
  for (const amount of creditAmounts) sum += Number(amount);
  return sum;
}

async function assertFinalApBillReconciliation(
  db: Parameters<typeof findApBillById>[0],
  billId: string,
  organizationId: string,
): Promise<void> {
  await db.execute(
    sql`SELECT app.validate_ap_bill_recognition_atoms(${billId}::uuid, ${organizationId}::uuid)`,
  );
}

export async function editRecognizedApBill(
  context: OrgContext,
  raw: EditRecognizedApBillInput,
): Promise<ApBillRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const parsed = editRecognizedApBillSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;

  const billPreview = await findApBillById(context.db, context.organizationId, input.billId);
  if (!billPreview || billPreview.archivedAt) throw new NotFoundError('AP bill');
  if (!isRecognizedVendorBillStatus(billPreview.status)) {
    throw new DomainRuleError(
      'Only recognized vendor bills can be edited here',
      'ap.errors.billNotRecognized',
    );
  }

  const freezeDate = billPreview.billDate ?? billPreview.createdAt.toISOString().slice(0, 10);

  try {
    await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(freezeDate));

    const vendor = await findVendorById(context.db, context.organizationId, input.vendorId);
    if (!vendor || vendor.archivedAt) throw new NotFoundError('Vendor');

    if (input.projectId) {
      const project = await findProjectById(context.db, context.organizationId, input.projectId);
      if (!project || project.archivedAt) throw new NotFoundError('Project');
    }

    for (const line of input.lines) {
      if (!line.costCategoryId) {
        throw new DomainRuleError(
          'Choose an expense type on every line',
          'ap.errors.classificationRequired',
        );
      }
      const category = await findCostCategoryById(
        context.db,
        context.organizationId,
        line.costCategoryId,
      );
      if (!category) throw new NotFoundError('Cost category');
      if (isDeprecatedForNewTransactionEntry(category.key)) {
        throw new DomainRuleError(
          `Category ${category.key} is not available for AP lines`,
          'ap.errors.categoryNotAllowed',
        );
      }
      if (line.costFamily && line.costFamily !== category.family) {
        throw new DomainRuleError(
          'cost_family contradicts category family',
          'ap.errors.categoryFamilyMismatch',
        );
      }
    }

    const billDate = businessDate(input.billDate ?? freezeDate);
    const newYearMonth = yearMonthFromBusinessDate(billDate);
    if (newYearMonth !== yearMonthFromBusinessDate(freezeDate)) {
      await assertMonthOpenForRewrite(context, newYearMonth);
    }

    const taxResolution = await resolveApplicableDefaultTax(context, billDate);
    const taxSplit = resolveApBillTaxSplit({
      enteredAmount: input.totalAmount,
      currency: input.currency,
      amountIncludesTax: input.amountIncludesTax,
      netAmount: input.netAmount,
      taxAmount: input.taxAmount,
      resolved: taxResolution.resolved,
    });

    const lineAmountBasis = input.amountIncludesTax === true ? 'gross' : 'net';
    const lineMonetarySplits = allocateApLineMonetarySplits({
      currency: input.currency,
      billNetAmount: taxSplit.netAmount,
      billTaxAmount: taxSplit.taxAmount,
      billGrossAmount: taxSplit.grossAmount,
      lineAmountBasis,
      lines: input.lines,
    });
    assertBillTotalMatchesLines({
      currency: input.currency,
      totalAmount: lineAmountBasis === 'gross' ? taxSplit.grossAmount : taxSplit.netAmount,
      lines: input.lines,
    });
    assertApLineNetConservesBill({
      currency: input.currency,
      billNetAmount: taxSplit.netAmount,
      lineNetAmounts: lineMonetarySplits.map((split) => split.netAmount),
    });

    let updated: ApBillRow;
    await withTransaction(context.db, async (tx) => {
      const repo = getVendorPaymentsRepository();
      await repo.lockBillsForUpdate(tx, context.organizationId, [input.billId]);

      const bill = await findApBillById(tx, context.organizationId, input.billId);
      if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');
      if (!isRecognizedVendorBillStatus(bill.status)) {
        throw new DomainRuleError(
          'Only recognized vendor bills can be edited here',
          'ap.errors.billNotRecognized',
        );
      }

      const activePayments = await repo.listActiveAppliedAmountsForBill(
        tx,
        context.organizationId,
        bill.id,
      );
      const activeCredits = await listActiveCreditAmountsForBill(
        tx,
        context.organizationId,
        bill.id,
      );
      const appliedTotal = sumAppliedSettlements(activePayments, activeCredits);
      const newGross = Number(taxSplit.grossAmount);
      if (newGross + 0.000001 < appliedTotal) {
        throw new DomainRuleError(
          'Bill amount cannot be reduced below applied payments and credits',
          'ap.errors.billEditBelowAppliedSettlements',
          {
            applied: appliedTotal.toFixed(2),
            currency: input.currency.toUpperCase(),
          },
        );
      }

      const existingLines = await listApBillLines(tx, context.organizationId, bill.id);
      const existingById = new Map(existingLines.map((line) => [line.id, line]));
      const keepIds: string[] = [];

      updated = await withTrustedFinancialLatch(
        tx,
        {
          kind: INTERNAL_FINANCIAL_EDIT_LATCH,
          organizationId: context.organizationId,
          permission: PERMISSIONS.AP_MANAGE,
        },
        async () => {
          const header = await updateApBillFields(tx, context.organizationId, bill.id, {
            vendorId: input.vendorId,
            projectId: input.projectId ?? bill.projectId,
            billDate,
            currency: input.currency.toUpperCase(),
            totalAmount: taxSplit.totalAmount,
            netAmount: taxSplit.netAmount,
            taxAmount: taxSplit.taxAmount,
            grossAmount: taxSplit.grossAmount,
            amountIncludesTax: taxSplit.amountIncludesTax,
            taxSnapshot: taxSplit.taxSnapshot,
            taxBasis: taxSplit.taxBasis,
            notes: input.notes ?? bill.notes,
          });
          if (!header) throw new NotFoundError('AP bill');

          for (let index = 0; index < input.lines.length; index += 1) {
            const line = input.lines[index]!;
            const monetary = lineMonetarySplits[index]!;
            const classificationStatus = resolveApClassificationStatus({
              costCategoryId: line.costCategoryId!,
              categoryKey: (
                await findCostCategoryById(tx, context.organizationId, line.costCategoryId!)
              )?.key ?? null,
            });
            const economicTargetType = line.economicTargetType ?? 'inherit';
            const linePayload = {
              description: line.description,
              quantity: line.quantity,
              unitAmount: line.unitAmount,
              lineTotal: monetary.grossAmount,
              netAmount: monetary.netAmount,
              taxAmount: monetary.taxAmount,
              grossAmount: monetary.grossAmount,
              currency: line.currency.toUpperCase(),
              economicTargetType,
              projectId:
                economicTargetType === 'project'
                  ? (line.projectId ?? input.projectId ?? bill.projectId ?? null)
                  : null,
              purchaseOrderLineId: line.purchaseOrderLineId ?? null,
              costCategoryId: line.costCategoryId ?? null,
              costFamily: line.costFamily ?? null,
              classificationStatus,
              sortOrder: index,
            };

            if (line.lineId && existingById.has(line.lineId)) {
              keepIds.push(line.lineId);
              await updateApBillLine(tx, context.organizationId, line.lineId, linePayload);
            } else {
              const newId = randomUUID();
              keepIds.push(newId);
              await insertApBillLines(tx, [
                {
                  id: newId,
                  organizationId: context.organizationId,
                  apBillId: bill.id,
                  ...linePayload,
                },
              ]);
            }
          }

          await deleteApBillLinesNotIn(tx, context.organizationId, bill.id, keepIds);
          await assertFinalApBillReconciliation(tx, bill.id, context.organizationId);
          return header;
        },
      );

      await recordAuditEvent({ ...context, db: tx }, {
        action: AUDIT_ACTIONS.AP_BILL_UPDATED,
        entityType: 'ap_bill',
        entityId: bill.id,
        before: {
          netAmount: bill.netAmount,
          vendorId: bill.vendorId,
          billDate: bill.billDate,
        },
        after: {
          netAmount: updated.netAmount,
          vendorId: updated.vendorId,
          billDate: updated.billDate,
        },
      });
    });

    const { tryRecomputeOpenGeneralCostMonth } = await import(
      '@/modules/financials/application/recompute-general-cost-month'
    );
    await tryRecomputeOpenGeneralCostMonth(context, { date: updated!.billDate ?? freezeDate });

    return updated!;
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
    throw error;
  }
}
