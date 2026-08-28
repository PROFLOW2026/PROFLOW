/**
 * AP bill void - remove from Actual, supersede allocations, preserve history.
 * Active payments must be voided first.
 */

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { withTrustedFinancialLatch } from '@/shared/db/trusted-financial-latch';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { addMoney, compareMoney, money } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import {
  findCommittedCostForPo,
  findPurchaseOrderById,
  updateCommittedCostConsumption,
} from '@/modules/procurement';
import { findApBillById, updateApBillStatus, type ApBillRow } from '../data/ap.repository';
import { supersedeActiveBillAllocations } from '../data/bill-project-allocations.repository';
import { listActiveCreditAmountsForBill } from '../data/credits.repository';
import { getVendorPaymentsRepository } from '../data/payments.repository';
import {
  assertApBillVoidable,
  assertVoidRemovesFromActual,
} from '../domain/bill-lifecycle';
import { voidApBillSchema } from '../validation/schemas';

/**
 * Void a vendor bill.
 * - Blocks when active (recorded) payments exist - void payments first.
 * - Blocks when active credit applications exist - reverse credits first.
 * - Sets status to void → exits Actual recognition.
 * - Supersedes project allocations (history preserved as superseded).
 * - Restores PO commitment previously consumed at bill create (when linked).
 * - Does not delete the bill or its lines / matches / payment history.
 */
export async function voidApBill(context: OrgContext, raw: { billId: string }): Promise<ApBillRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const parsed = voidApBillSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const billPreview = await findApBillById(
    context.db,
    context.organizationId,
    parsed.data.billId,
  );
  if (!billPreview || billPreview.archivedAt) throw new NotFoundError('AP bill');
  const freezeDate =
    billPreview.billDate ??
    billPreview.createdAt.toISOString().slice(0, 10);

  let voided: { before: ApBillRow; after: ApBillRow };
  try {
    await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(freezeDate));

    voided = await withTransaction(context.db, async (tx) => {
      const repo = getVendorPaymentsRepository();
      await repo.lockBillsForUpdate(tx, context.organizationId, [parsed.data.billId]);

      const bill = await findApBillById(tx, context.organizationId, parsed.data.billId);
      if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');

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
      assertApBillVoidable({
        billStatus: bill.status,
        hasActivePayments: activePayments.length > 0,
        hasActiveCredits: activeCredits.length > 0,
      });

      await supersedeActiveBillAllocations(tx, context.organizationId, bill.id);

      if (bill.purchaseOrderId) {
        await restoreCommitmentForVoidedBill(tx, context.organizationId, bill);
      }

      const updated = await withTrustedFinancialLatch(
        tx,
        {
          kind: 'ap_bill_void',
          organizationId: context.organizationId,
          permission: PERMISSIONS.AP_MANAGE,
        },
        () => updateApBillStatus(tx, context.organizationId, bill.id, 'void'),
      );
      if (!updated) throw new NotFoundError('AP bill');
      assertVoidRemovesFromActual(updated.status as 'void');
      return { before: bill, after: updated };
    });
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_BILL_VOIDED,
    entityType: 'ap_bill',
    entityId: voided.after.id,
    before: { status: voided.before.status, totalAmount: voided.before.totalAmount },
    after: {
      status: voided.after.status,
      recognizedVendorActual: false,
      allocationsSuperseded: true,
    },
  });

  const { tryRecomputeOpenGeneralCostMonth } = await import(
    '@/modules/financials/application/recompute-general-cost-month'
  );
  await tryRecomputeOpenGeneralCostMonth(context, { date: freezeDate });

  return voided.after;
}

async function restoreCommitmentForVoidedBill(
  db: Parameters<typeof findCommittedCostForPo>[0],
  organizationId: string,
  bill: ApBillRow,
): Promise<void> {
  if (!bill.purchaseOrderId) return;

  const committed = await findCommittedCostForPo(db, organizationId, bill.purchaseOrderId);
  if (!committed) return;

  const po = await findPurchaseOrderById(db, organizationId, bill.purchaseOrderId);
  if (!po) return;

  const currency = committed.currency.toUpperCase();
  const cap = money(po.committedAmount, currency);
  const restored = addMoney(money(committed.amount, currency), money(bill.totalAmount, currency));
  const next =
    compareMoney(restored, cap) > 0 ? cap : restored;
  const nextStatus =
    compareMoney(next, cap) >= 0
      ? 'open'
      : compareMoney(next, money('0', currency)) <= 0
        ? 'closed'
        : 'partially_consumed';

  await updateCommittedCostConsumption(db, organizationId, committed.id, {
    amount: next.amount,
    status: nextStatus,
  });
}

/** @deprecated Use editRecognizedApBill in open months instead. */
export function rejectSilentRecognizedBillEdit(): never {
  throw new DomainRuleError(
    'This bill cannot be edited here; use the edit form while the month is open',
    'ap.errors.billEditUnavailable',
  );
}
