import { recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { money, toNumericString, zeroMoney } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { assertPlanActiveForCycle } from '../domain/lifecycle';
import {
  computeRemaining,
} from '../domain/line-math';
import { resolveCycleLineRetention } from '../domain/retention-math';
import { BILLING_PLAN_AUDIT_ACTIONS } from '../domain/types';
import { findPlanById } from '../data/plans.repository';
import { listLinesForPlan } from '../data/lines.repository';
import {
  insertCycle,
  insertCycleLines,
  nextCycleNumber,
  sumIssuedAmountsByPlanLine,
} from '../data/cycles.repository';
import { createCycleSchema, type CreateCycleInput } from '../validation/schemas';

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

export async function createBillingCycle(context: OrgContext, raw: CreateCycleInput) {
  assertPermission(context, PERMISSIONS.BILLING_MANAGE);
  const parsed = createCycleSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);
  const input = parsed.data;

  const plan = await findPlanById(context.db, context.organizationId, input.planId);
  if (!plan) throw new NotFoundError('Billing plan');
  assertPlanActiveForCycle(plan.status);

  const cycleNumber = await nextCycleNumber(
    context.db,
    context.organizationId,
    plan.id,
  );

  const cycle = await insertCycle(context.db, {
    organizationId: context.organizationId,
    planId: plan.id,
    projectId: plan.projectId,
    contractId: plan.contractId,
    cycleNumber,
    title: input.title,
    documentKind: input.documentKind ?? 'progress_account',
    status: 'draft',
    periodStart: input.periodStart ?? null,
    periodEnd: input.periodEnd ?? null,
    accountDate: input.accountDate,
    retentionPercent: input.retentionPercent ?? plan.defaultRetentionPercent,
    notes: input.notes ?? null,
  });

  if (input.seedFromPlan !== false) {
    const planLines = await listLinesForPlan(context.db, context.organizationId, plan.id);
    const billed = await sumIssuedAmountsByPlanLine(
      context.db,
      context.organizationId,
      plan.id,
    );

    const seedRows = planLines.map((line, index) => {
      const base = money(line.agreedAmount, plan.currency);
      const priorRaw = billed.get(line.id)?.amount ?? '0';
      const priorPctRaw = billed.get(line.id)?.percent ?? '0';
      const prior = money(priorRaw, plan.currency);
      const remaining = computeRemaining(base, prior);

      return {
        organizationId: context.organizationId,
        cycleId: cycle.id,
        planLineId: line.id,
        sortOrder: index,
        currentPercent: null,
        currentAmount: null,
        priorPercent: priorPctRaw,
        priorAmount: toNumericString(prior),
        cumulativePercent: priorPctRaw,
        cumulativeAmount: toNumericString(prior),
        remainingAmount: toNumericString(remaining),
        baseAmountSnapshot: toNumericString(base),
        retentionAmount: toNumericString(zeroMoney(plan.currency)),
        lineNotes: null as string | null,
      };
    });

    await insertCycleLines(context.db, seedRows);
  }

  await recordAuditEvent(context, {
    action: BILLING_PLAN_AUDIT_ACTIONS.CYCLE_CREATED,
    entityType: 'project_billing_cycle',
    entityId: cycle.id,
    after: {
      planId: plan.id,
      cycleNumber: cycle.cycleNumber,
      title: cycle.title,
    },
  });

  return cycle;
}

/** Used by update-cycle-lines to recompute retention for a line amount. */
export function retentionForCycleLineAmount(input: {
  readonly amount: string;
  readonly currency: string;
  readonly retentionPercent: string | null;
}): string {
  return toNumericString(
    resolveCycleLineRetention({
      lineAmount: input.amount,
      currency: input.currency,
      retentionPercent: input.retentionPercent,
    }),
  );
}
