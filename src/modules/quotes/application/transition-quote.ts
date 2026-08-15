import { assertApprovalAllowsAction } from '@/modules/approvals';
import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import {
  isQuoteDiscountGateTransition,
  quoteDiscountAmountForApproval,
} from '../domain/discount';
import { assertCanTransitionQuoteStatus } from '../domain/lifecycle';
import { QUOTES_AUDIT_ACTIONS, type QuoteRecord, type QuoteStatus } from '../domain/types';
import { findQuoteById, updateQuoteById } from '../data/quotes.repository';
import { transitionQuoteSchema, type TransitionQuoteInput } from '../validation/schemas';
import { recordQuoteClientActivity } from './timeline-events';

const DECISION_STATUSES: readonly QuoteStatus[] = [
  'accepted',
  'rejected',
  'expired',
  'cancelled',
];

/**
 * Lifecycle transitions only. Convert is a separate use case (accepted → project/job).
 * Transition to `converted` is rejected here — must go through convertQuote.
 */
export async function transitionQuoteStatus(
  context: OrgContext,
  rawInput: TransitionQuoteInput,
): Promise<QuoteRecord> {
  assertPermission(context, PERMISSIONS.QUOTES_MANAGE);

  const parsed = transitionQuoteSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const { quoteId, toStatus } = parsed.data;
  if (toStatus === 'converted') {
    throw new DomainRuleError(
      'Use convert to create a project or job from an accepted quote',
      'quotes.errors.useConvert',
    );
  }

  const existing = await findQuoteById(context.db, context.organizationId, quoteId);
  if (!existing) throw new NotFoundError('Quote');

  assertCanTransitionQuoteStatus(existing.status, toStatus);

  // Customer-facing lock (`sent`): large discounts matching a quote_discount
  // rule cannot issue until approved. No matching rule / no discount → allow.
  if (isQuoteDiscountGateTransition(toStatus)) {
    const gate = quoteDiscountAmountForApproval(existing);
    if (gate) {
      await assertApprovalAllowsAction(context, {
        entityType: 'quote_discount',
        entityId: existing.id,
        amount: gate.amount,
        currency: gate.currency,
        submitIfMissing: true,
      });
    }
  }

  const now = new Date();
  const patch: Parameters<typeof updateQuoteById>[3] = {
    status: toStatus,
  };

  if (toStatus === 'sent') {
    patch.sentAt = existing.sentAt ?? now;
  }
  if (DECISION_STATUSES.includes(toStatus)) {
    patch.decidedAt = now;
  }

  const updated = await updateQuoteById(context.db, context.organizationId, quoteId, patch);
  if (!updated) throw new NotFoundError('Quote');

  await noteModuleUsage(context.db, context.organizationId, 'quotes');
  await recordAuditEvent(context, {
    action: QUOTES_AUDIT_ACTIONS.STATUS_CHANGED,
    entityType: 'estimate_quote',
    entityId: updated.id,
    before: { status: existing.status },
    after: { status: updated.status, sentAt: updated.sentAt, decidedAt: updated.decidedAt },
  });

  if (toStatus === 'sent') {
    await recordQuoteClientActivity(context, {
      clientId: updated.clientId,
      kind: 'quote_submitted',
      entityType: 'estimate',
      entityId: updated.id,
      summary: updated.title,
      deepLink: `/quotes/${updated.id}`,
    });
  }
  if (toStatus === 'accepted') {
    await recordQuoteClientActivity(context, {
      clientId: updated.clientId,
      kind: 'quote_approved',
      entityType: 'estimate',
      entityId: updated.id,
      summary: updated.title,
      deepLink: `/quotes/${updated.id}`,
    });
  }

  return updated;
}
