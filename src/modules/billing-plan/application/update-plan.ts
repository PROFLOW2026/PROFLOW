import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  assertCanTransitionPlanStatus,
  assertPlanEditable,
} from '../domain/lifecycle';
import { BILLING_PLAN_AUDIT_ACTIONS, type BillingPlanStatus } from '../domain/types';
import { findPlanById, updatePlan } from '../data/plans.repository';
import { ensureNoConflictingActivePlan } from './create-plan';
import { updatePlanSchema, type UpdatePlanInput } from '../validation/schemas';

function throwZod(error: {
  issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>;
}): never {
  throw new ValidationError(
    error.issues.map((issue) => ({
      path: issue.path.map(String).join('.'),
      message: issue.message,
    })),
  );
}

export async function updateBillingPlan(context: OrgContext, raw: UpdatePlanInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = updatePlanSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;

  const plan = await findPlanById(context.db, context.organizationId, input.planId);
  if (!plan) throw new NotFoundError('Billing plan');

  const patch: Parameters<typeof updatePlan>[3] = {};

  if (input.name !== undefined) {
    assertPlanEditable(plan.status);
    patch.name = input.name;
  }
  if (input.notes !== undefined) {
    assertPlanEditable(plan.status);
    patch.notes = input.notes;
  }
  if (input.defaultRetentionPercent !== undefined) {
    assertPlanEditable(plan.status);
    patch.defaultRetentionPercent = input.defaultRetentionPercent;
  }

  if (input.status !== undefined && input.status !== plan.status) {
    assertCanTransitionPlanStatus(plan.status, input.status as BillingPlanStatus);
    if (input.status === 'active') {
      await ensureNoConflictingActivePlan(
        context,
        plan.projectId,
        plan.contractId,
        plan.id,
      );
      patch.activatedAt = new Date();
    }
    if (input.status === 'completed') {
      patch.completedAt = new Date();
    }
    if (input.status === 'archived') {
      patch.archivedAt = new Date();
    }
    patch.status = input.status;
  }

  const updated = await updatePlan(context.db, context.organizationId, plan.id, patch);
  if (!updated) throw new NotFoundError('Billing plan');

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.PLAN_UPDATED,
    entityType: 'project_billing_plan',
    entityId: plan.id,
    before: { status: plan.status, name: plan.name },
    after: { status: updated.status, name: updated.name },
  });

  return updated;
}
