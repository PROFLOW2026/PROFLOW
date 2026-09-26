import { recordAuditEvent } from '@/shared/audit';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findBillingRecordById,
  isMissingCollectionColumnError,
  updateBillingCollectionFollowUpRow,
} from '../data/billing.repository';
import {
  collectionFollowUpColumnSet,
  showsCollectionFollowUp,
  validateCollectionFollowUp,
} from '../domain/collection-follow-up';
import {
  updateCollectionFollowUpSchema,
  type UpdateCollectionFollowUpInput,
} from '../validation/schemas';

const BILLING_AUDIT_UPDATED = 'billing_record.updated';

/**
 * Saves collection follow-up on a finalized outstanding or overdue invoice.
 *
 * Writes only the four collection columns. Does not call assertEditable or
 * assertMonthOpenForRewrite: those freeze every billing rewrite, including
 * fields that are not money. Amounts, status, VAT, and due date stay as they are.
 */
export async function updateBillingCollectionFollowUp(
  context: OrgContext,
  rawInput: UpdateCollectionFollowUpInput,
) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);

  const parsed = updateCollectionFollowUpSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        message: issue.message,
      })),
    );
  }

  const fields = validateCollectionFollowUp(parsed.data);
  if (!fields.ok) {
    throw new ValidationError(
      fields.issues.map((issue) => ({ path: issue.path, message: issue.message })),
    );
  }

  const existing = await findBillingRecordById(
    context.db,
    context.organizationId,
    parsed.data.billingRecordId,
    context.organization.timezone,
  );
  if (!existing) throw new NotFoundError('Billing record');
  if (!showsCollectionFollowUp(existing)) {
    throw new DomainRuleError(
      'Collection follow-up is only for a finalized invoice that is still outstanding or overdue',
      'billing.errors.collectionFollowUpNotEligible',
    );
  }

  const patch = collectionFollowUpColumnSet(fields.value);
  try {
    await updateBillingCollectionFollowUpRow(context.db, context.organizationId, existing.id, {
      collectionContactedAt: patch.collectionContactedAt ? businessDate(patch.collectionContactedAt) : null,
      collectionNextFollowUpAt: patch.collectionNextFollowUpAt
        ? businessDate(patch.collectionNextFollowUpAt)
        : null,
      collectionPromiseToPayDate: patch.collectionPromiseToPayDate
        ? businessDate(patch.collectionPromiseToPayDate)
        : null,
      collectionNote: patch.collectionNote,
    });
  } catch (error) {
    if (isMissingCollectionColumnError(error)) {
      throw new DomainRuleError(
        'Collection follow-up columns are not on the database yet',
        'billing.errors.collectionFollowUpUnavailable',
      );
    }
    throw error;
  }

  await recordAuditEvent(context, {
    action: BILLING_AUDIT_UPDATED,
    entityType: 'billing_record',
    entityId: existing.id,
    metadata: { scope: 'collection_follow_up' },
    before: {
      collectionContactedAt: existing.collectionContactedAt,
      collectionNextFollowUpAt: existing.collectionNextFollowUpAt,
      collectionPromiseToPayDate: existing.collectionPromiseToPayDate,
      collectionNote: existing.collectionNote,
    },
    after: patch,
  });

  const updated = await findBillingRecordById(
    context.db,
    context.organizationId,
    existing.id,
    context.organization.timezone,
  );
  if (!updated) throw new NotFoundError('Billing record');
  return updated;
}
