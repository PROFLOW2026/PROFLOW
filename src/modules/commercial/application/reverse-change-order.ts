import { isMonthClosed, yearMonthFromBusinessDate } from '@/modules/month-close';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { withTransaction } from '@/shared/db';
import { businessDate, todayInTimeZone } from '@/shared/dates';
import { ConflictError, DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { reverseChangeOrderBlockReason } from '../domain/change-order-reversal';
import { COMMERCIAL_AUDIT_ACTIONS } from '../domain/types';
import {
  findChangeOrderById,
  findReversalOfChangeOrder,
  hasFinalizedBillingForChangeOrder,
  reverseChangeOrderRpc,
} from '../data/quotes.repository';
import {
  reverseChangeOrderSchema,
  type ReverseChangeOrderInput,
} from '../validation/schemas';

export interface ReverseChangeOrderResult {
  readonly reversalChangeOrderId: string;
  readonly reference: string;
}

/**
 * Canonical commercial reversal: one SQL transaction inserts the reversing CO,
 * the opposite contract_value_event, and unwinds only that CO's BOQ allocations.
 * Direct BOQ unwind without this path is impossible for changes.approve.
 */
export async function reverseChangeOrder(
  context: OrgContext,
  rawInput: ReverseChangeOrderInput,
): Promise<ReverseChangeOrderResult> {
  assertPermission(context, PERMISSIONS.CHANGES_APPROVE);

  const parsed = reverseChangeOrderSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const input = parsed.data;

  return withTransaction(context.db, async (tx) => {
    const txContext = { ...context, db: tx };
    const original = await findChangeOrderById(
      tx,
      context.organizationId,
      input.changeOrderId,
    );
    if (!original) throw new NotFoundError('Change order');
    assertSameOrganization(context, original, 'Change order');

    const existingReversal = await findReversalOfChangeOrder(
      tx,
      context.organizationId,
      original.id,
    );
    const blocked = reverseChangeOrderBlockReason({
      original,
      existingReversalId: existingReversal?.id ?? null,
    });
    if (blocked === 'is_reversal') {
      throw new DomainRuleError(
        'Cannot reverse a reversing change order',
        'changes.errors.cannotReverseReversal',
      );
    }
    if (blocked === 'already_reversed') {
      throw new ConflictError(
        'Change order already reversed',
        'changes.errors.alreadyReversed',
      );
    }

    const billed = await hasFinalizedBillingForChangeOrder(
      tx,
      context.organizationId,
      original.id,
    );
    if (billed) {
      throw new ConflictError(
        'Cannot reverse a change order with finalized billing; issue a credit note first',
        'changes.errors.unsafeBilling',
      );
    }

    const today = todayInTimeZone(context.organization.timezone);
    let effectiveDate = input.effectiveDate ? businessDate(input.effectiveDate) : today;
    if (await isMonthClosed(txContext, yearMonthFromBusinessDate(effectiveDate))) {
      effectiveDate = today;
    }
    if (await isMonthClosed(txContext, yearMonthFromBusinessDate(effectiveDate))) {
      throw new DomainRuleError(
        'Cannot reverse a change order into a closed month',
        'changes.errors.closedMonth',
      );
    }

    const reversed = await reverseChangeOrderRpc(
      tx,
      context.organizationId,
      original.id,
      input.reason,
      effectiveDate,
    );
    if (!reversed.reference) {
      throw new DomainRuleError(
        'Change order reference missing after insert',
        'changes.errors.referenceConflict',
      );
    }

    const reversal = await findChangeOrderById(
      tx,
      context.organizationId,
      reversed.reversalChangeOrderId,
    );
    if (!reversal) throw new NotFoundError('Change order');

    const reversedAt = new Date().toISOString();
    await recordAuditEvent(txContext, {
      action: COMMERCIAL_AUDIT_ACTIONS.CHANGE_ORDER_REVERSED,
      entityType: 'change_order',
      entityId: reversal.id,
      before: {
        id: original.id,
        direction: original.direction,
        amount: original.amount,
        currency: original.currency,
      },
      after: reversal,
      metadata: {
        originalChangeOrderId: original.id,
        reason: input.reason,
        actorUserId: context.userId,
        reversedAt,
      },
    });

    return { reversalChangeOrderId: reversal.id, reference: reversed.reference };
  });
}
