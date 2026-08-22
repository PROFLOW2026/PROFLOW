import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { toNumericString } from '@/shared/money';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  computeCurrentContractValue,
  findContractById,
  listContractValueEvents,
} from '@/modules/projects';
import { reconcileBillingPlan } from '../domain/plan-reconciliation';
import { accumulateRetention } from '../domain/retention-math';
import { findPlanById } from '../data/plans.repository';
import { listLinesForPlan, listSectionsForPlan } from '../data/lines.repository';
import {
  listCyclesForPlan,
  listIssuedRetentionAmounts,
  sumIssuedAmountsByPlanLine,
} from '../data/cycles.repository';
import { planIdSchema } from '../validation/schemas';
import { listPlanRetentionHoldings } from './release-plan-retention';

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

export async function getBillingPlanDetail(context: OrgContext, raw: { planId: string }) {
  assertPermission(context, PERMISSIONS.BILLING_READ);
  const parsed = planIdSchema.safeParse(raw);
  if (!parsed.success) throwZod(parsed.error);

  const plan = await findPlanById(context.db, context.organizationId, parsed.data.planId);
  if (!plan) throw new NotFoundError('Billing plan');

  const [sections, lines, cycles, billed, contract, events, retentionAmounts] =
    await Promise.all([
      listSectionsForPlan(context.db, context.organizationId, plan.id),
      listLinesForPlan(context.db, context.organizationId, plan.id),
      listCyclesForPlan(context.db, context.organizationId, plan.id),
      sumIssuedAmountsByPlanLine(context.db, context.organizationId, plan.id),
      findContractById(context.db, context.organizationId, plan.contractId),
      listContractValueEvents(context.db, context.organizationId, plan.contractId),
      listIssuedRetentionAmounts(context.db, context.organizationId, plan.id),
    ]);

  if (!contract) throw new NotFoundError('Contract');

  const contractValue = computeCurrentContractValue(events, plan.currency);
  const reconciliation = reconcileBillingPlan({
    currency: plan.currency,
    contractValue,
    lines: lines.map((line) => ({
      planLineId: line.id,
      agreedAmount: line.agreedAmount,
      billedAmount: billed.get(line.id)?.amount ?? '0',
    })),
  });

  const retentionAccumulated = accumulateRetention(plan.currency, retentionAmounts);
  const holdings = await listPlanRetentionHoldings(context, plan.id);

  return {
    plan,
    contract: {
      id: contract.id,
      name: contract.name,
      contractNumber: contract.contractNumber,
      currentContractValue: toNumericString(contractValue),
    },
    sections,
    lines,
    cycles,
    reconciliation,
    retentionAccumulated: toNumericString(retentionAccumulated),
    retentionHeldRemaining: holdings.heldRemaining,
  };
}
