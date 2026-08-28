/**
 * Restore a mistakenly voided AP bill while the month is still open (0071).
 */

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { AP_BILL_RESTORE_LATCH } from '@/shared/db/financial-latch-kinds';
import { withTrustedFinancialLatch } from '@/shared/db/trusted-financial-latch';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertMonthOpenForRewrite,
  rethrowClosedPeriodRewrite,
  yearMonthFromBusinessDate,
} from '@/modules/month-close';
import {
  computeCommittedAfterConsumption,
  findOpenCommittedCostForPo,
  updateCommittedCostConsumption,
} from '@/modules/procurement';
import {
  findApBillById,
  listApBillLines,
  updateApBillFields,
  type ApBillRow,
} from '../data/ap.repository';
import { getVendorPaymentsRepository } from '../data/payments.repository';
import { listActiveCreditAmountsForBill } from '../data/credits.repository';
import { consumeAmountForPostedPoBill } from '../domain/vendor-cost-recognition';
import { restoreApBillSchema } from '../validation/schemas';

export async function restoreApBill(
  context: OrgContext,
  raw: { billId: string },
): Promise<ApBillRow> {
  assertPermission(context, PERMISSIONS.AP_MANAGE);

  const parsed = restoreApBillSchema.safeParse(raw);
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
  if (billPreview.status !== 'void') {
    throw new DomainRuleError(
      'Only void bills can be restored',
      'ap.errors.billNotVoid',
    );
  }

  const freezeDate =
    billPreview.billDate ?? billPreview.createdAt.toISOString().slice(0, 10);

  const lines = await listApBillLines(context.db, context.organizationId, billPreview.id);
  if (lines.length === 0) {
    throw new DomainRuleError(
      'Cannot restore a bill without lines',
      'ap.errors.linesRequired',
    );
  }
  for (const line of lines) {
    if (line.classificationStatus !== 'classified' || !line.costCategoryId) {
      throw new DomainRuleError(
        'Every line must have an expense type before restore',
        'ap.errors.classificationRequired',
      );
    }
  }

  let restored: { before: ApBillRow; after: ApBillRow };
  try {
    await assertMonthOpenForRewrite(context, yearMonthFromBusinessDate(freezeDate));

    restored = await withTransaction(context.db, async (tx) => {
      const repo = getVendorPaymentsRepository();
      await repo.lockBillsForUpdate(tx, context.organizationId, [parsed.data.billId]);

      const bill = await findApBillById(tx, context.organizationId, parsed.data.billId);
      if (!bill || bill.archivedAt) throw new NotFoundError('AP bill');
      if (bill.status !== 'void') {
        throw new DomainRuleError('Only void bills can be restored', 'ap.errors.billNotVoid');
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
      if (activePayments.length > 0 || activeCredits.length > 0) {
        throw new DomainRuleError(
          'Remove active payments and credits before restoring this bill',
          'ap.errors.restoreBlockedBySettlements',
        );
      }

      const updated = await withTrustedFinancialLatch(
        tx,
        {
          kind: AP_BILL_RESTORE_LATCH,
          organizationId: context.organizationId,
          permission: PERMISSIONS.AP_MANAGE,
        },
        () =>
          updateApBillFields(tx, context.organizationId, bill.id, {
            status: 'open',
            retentionHeldRemaining: bill.retentionAmount,
          }),
      );
      if (!updated) throw new NotFoundError('AP bill');

      if (updated.purchaseOrderId) {
        await reconsumePoCommitmentForRestoredBill(tx, context.organizationId, updated);
      }

      return { before: bill, after: updated };
    });
  } catch (error) {
    rethrowClosedPeriodRewrite(error);
    throw error;
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.AP_BILL_RESTORED,
    entityType: 'ap_bill',
    entityId: restored.after.id,
    before: { status: restored.before.status },
    after: { status: restored.after.status, recognizedVendorActual: true },
  });

  const { tryRecomputeOpenGeneralCostMonth } = await import(
    '@/modules/financials/application/recompute-general-cost-month'
  );
  await tryRecomputeOpenGeneralCostMonth(context, { date: freezeDate });

  return restored.after;
}

async function reconsumePoCommitmentForRestoredBill(
  db: Parameters<typeof findOpenCommittedCostForPo>[0],
  organizationId: string,
  bill: ApBillRow,
): Promise<void> {
  if (!bill.purchaseOrderId) return;

  const openCommitted = await findOpenCommittedCostForPo(db, organizationId, bill.purchaseOrderId);
  if (!openCommitted) return;

  const { consumeAmount } = consumeAmountForPostedPoBill({
    openCommitmentAmount: openCommitted.amount,
    billTotal: bill.netAmount,
    currency: openCommitted.currency,
  });
  const next = computeCommittedAfterConsumption({
    openAmount: openCommitted.amount,
    consumeAmount,
    currency: openCommitted.currency,
  });
  await updateCommittedCostConsumption(db, organizationId, openCommitted.id, {
    amount: next.remainingAmount,
    status: next.status,
  });
}
