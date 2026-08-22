import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import {
  isZeroMoney,
  money,
  sumMoney,
  toNumericString,
  zeroMoney,
} from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { DbExecutor } from '@/shared/db/types';
import { findPlanById } from '../data/plans.repository';
import { listLinesForPlan } from '../data/lines.repository';
import {
  findCycleById,
  listCycleLines,
} from '../data/cycles.repository';
import { cycleIdSchema } from '../validation/schemas';

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

type PlanSnapshot = {
  readonly id: string;
  readonly name: string;
  readonly currency: string;
  readonly status: string;
  readonly defaultRetentionPercent: string | null;
};

type PlanLineSnapshot = {
  readonly id: string;
  readonly label: string;
  readonly lineKind: string;
  readonly agreedAmount: string;
};

export type BillingPlanDetailSnapshot = {
  readonly plan: PlanSnapshot;
  readonly lines: readonly PlanLineSnapshot[];
};

export async function getBillingCycleDetail(context: OrgContext, raw: { cycleId: string }) {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const parsed = cycleIdSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);

  const cycle = await findCycleById(
    context.db,
    context.organizationId,
    parsed.data.cycleId,
  );
  if (!cycle) throw new NotFoundError('Billing cycle');

  const plan = await findPlanById(context.db, context.organizationId, cycle.planId);
  if (!plan) throw new NotFoundError('Billing plan');

  const planLines = await listLinesForPlan(context.db, context.organizationId, plan.id);
  return buildBillingCycleDetail(context.db, context.organizationId, cycle, plan, planLines);
}

/** Reuses plan lines from getBillingPlanDetail — skips duplicate plan + line reads. */
export async function getBillingCycleDetailFromPlanDetail(
  context: OrgContext,
  cycleId: string,
  planDetail: BillingPlanDetailSnapshot,
) {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const cycle = await findCycleById(context.db, context.organizationId, cycleId);
  if (!cycle || cycle.planId !== planDetail.plan.id) {
    throw new NotFoundError('Billing cycle');
  }

  return buildBillingCycleDetail(
    context.db,
    context.organizationId,
    cycle,
    planDetail.plan,
    planDetail.lines,
  );
}

async function buildBillingCycleDetail(
  db: DbExecutor,
  organizationId: string,
  cycle: NonNullable<Awaited<ReturnType<typeof findCycleById>>>,
  plan: PlanSnapshot,
  planLines: readonly PlanLineSnapshot[],
) {
  const cycleLines = await listCycleLines(db, organizationId, cycle.id);
  const planLineById = new Map(planLines.map((line) => [line.id, line]));
  const linesWithLabels = [];
  const currentParts = [];
  const retentionParts = [];

  for (const cl of cycleLines) {
    const planLine = planLineById.get(cl.planLineId);
    linesWithLabels.push({
      ...cl,
      label: planLine?.label ?? cl.planLineId,
      lineKind: planLine?.lineKind ?? 'manual',
      agreedAmount: planLine?.agreedAmount ?? cl.baseAmountSnapshot,
    });
    const current = money(cl.currentAmount ?? '0', plan.currency);
    if (!isZeroMoney(current)) currentParts.push(current);
    retentionParts.push(money(cl.retentionAmount, plan.currency));
  }

  const currentTotal =
    currentParts.length === 0 ? zeroMoney(plan.currency) : sumMoney(currentParts, plan.currency);
  const retentionTotal =
    retentionParts.length === 0
      ? zeroMoney(plan.currency)
      : sumMoney(retentionParts, plan.currency);

  return {
    cycle,
    plan: {
      id: plan.id,
      name: plan.name,
      currency: plan.currency,
      status: plan.status,
      defaultRetentionPercent: plan.defaultRetentionPercent,
    },
    lines: linesWithLabels,
    totals: {
      currentAmount: toNumericString(currentTotal),
      retentionAmount: toNumericString(retentionTotal),
      currency: plan.currency,
    },
  };
}
