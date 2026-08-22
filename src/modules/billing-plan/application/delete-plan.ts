import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { BILLING_PLAN_AUDIT_ACTIONS, type BillingCycleStatus } from '../domain/types';
import { findPlanById, deletePlanById } from '../data/plans.repository';
import {
  deleteAllCyclesForPlan,
  listCyclesForPlan,
  sumApprovedAmountsByPlanLine,
} from '../data/cycles.repository';
import { deletePlanSchema, type DeletePlanInput } from '../validation/schemas';

const DELETABLE_CYCLE_STATUSES: ReadonlySet<BillingCycleStatus> = new Set([
  'draft',
  'ready',
  'void',
]);

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

/** True when the plan has no issued billing / approved history. */
export async function canDeleteBillingPlan(
  context: OrgContext,
  planId: string,
): Promise<{ allowed: boolean; reasonKey?: string }> {
  const plan = await findPlanById(context.db, context.organizationId, planId);
  if (!plan) return { allowed: false, reasonKey: 'billingPlan.errors.planNotDeletable' };
  if (plan.status !== 'draft') {
    return { allowed: false, reasonKey: 'billingPlan.errors.planNotDeletable' };
  }

  const cycles = await listCyclesForPlan(context.db, context.organizationId, planId);
  for (const cycle of cycles) {
    if (cycle.billingRecordId) {
      return { allowed: false, reasonKey: 'billingPlan.errors.planHasBillingHistory' };
    }
    if (!DELETABLE_CYCLE_STATUSES.has(cycle.status)) {
      return { allowed: false, reasonKey: 'billingPlan.errors.planHasBillingHistory' };
    }
  }

  const billed = await sumApprovedAmountsByPlanLine(
    context.db,
    context.organizationId,
    planId,
  );
  for (const row of billed.values()) {
    if (row.amount !== '0' && row.amount !== '0.00000000') {
      return { allowed: false, reasonKey: 'billingPlan.errors.planHasBillingHistory' };
    }
  }

  return { allowed: true };
}

export async function deleteBillingPlan(context: OrgContext, raw: DeletePlanInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = deletePlanSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);

  const plan = await findPlanById(context.db, context.organizationId, parsed.data.planId);
  if (!plan) throw new NotFoundError('Billing plan');

  const gate = await canDeleteBillingPlan(context, plan.id);
  if (!gate.allowed) {
    throw new DomainRuleError(
      'Billing plan cannot be deleted once billing history exists',
      gate.reasonKey ?? 'billingPlan.errors.planNotDeletable',
    );
  }

  await deleteAllCyclesForPlan(context.db, context.organizationId, plan.id);
  await deletePlanById(context.db, context.organizationId, plan.id);

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.PLAN_UPDATED,
    entityType: 'project_billing_plan',
    entityId: plan.id,
    before: { status: plan.status, name: plan.name, deleted: false },
    after: { deleted: true },
  });
}
