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
import { findPlanById } from '../data/plans.repository';
import { findLineById } from '../data/lines.repository';
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

  const cycleLines = await listCycleLines(context.db, context.organizationId, cycle.id);
  const linesWithLabels = [];
  const currentParts = [];
  const retentionParts = [];

  for (const cl of cycleLines) {
    const planLine = await findLineById(context.db, context.organizationId, cl.planLineId);
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
