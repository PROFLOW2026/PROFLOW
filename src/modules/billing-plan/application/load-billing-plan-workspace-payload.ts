import type { OrgContext } from '@/shared/auth/context';
import { listBillingContractOptionsForOrg } from '@/modules/billing';
import { findProjectById } from '@/modules/projects';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { canDeleteBillingPlan } from './delete-plan';
import { getBillingCycleDetailFromPlanDetail } from './get-cycle-detail';
import { getBillingPlanDetail } from './get-plan-detail';
import { listActiveTemplates } from '../data/templates.repository';
import { listPlansForProject as listPlansRows } from '../data/plans.repository';

export type BillingPlanWorkspacePayload = Awaited<ReturnType<typeof loadBillingPlanWorkspacePayload>>;

/**
 * Billing-plan tab read model: parallel shell fetches, single plan detail pass,
 * cycle detail reuses plan lines (no second plan/lines fetch).
 */
export async function loadBillingPlanWorkspacePayload(
  context: OrgContext,
  input: {
    readonly projectId: string;
    readonly contractId?: string | null;
    readonly cycleId?: string | null;
  },
) {
  assertPermission(context, PERMISSIONS.BILLING_READ);

  const [project, contracts, orgTemplateRows] = await Promise.all([
    findProjectById(context.db, context.organizationId, input.projectId),
    listBillingContractOptionsForOrg(context, input.projectId),
    listActiveTemplates(context.db, context.organizationId),
  ]);

  const selectedContractId =
    input.contractId ??
    contracts.find((c) => c.isPrimary)?.id ??
    contracts[0]?.id ??
    null;

  const orgTemplates = orgTemplateRows.map((row) => ({ id: row.id, name: row.name }));

  if (!selectedContractId) {
    return {
      project,
      contracts,
      selectedContractId: null as string | null,
      detail: null as Awaited<ReturnType<typeof getBillingPlanDetail>> | null,
      cycleDetail: null as Awaited<ReturnType<typeof getBillingCycleDetailFromPlanDetail>> | null,
      orgTemplates,
      canDelete: false,
    };
  }

  const plans = await listPlansRows(context.db, context.organizationId, input.projectId, {
    contractId: selectedContractId,
    includeArchived: false,
  });

  const preferred =
    plans.find((p) => p.status === 'active') ??
    plans.find((p) => p.status === 'draft') ??
    plans[0] ??
    null;

  const detail = preferred
    ? await getBillingPlanDetail(context, { planId: preferred.id })
    : null;

  let cycleDetail: Awaited<ReturnType<typeof getBillingCycleDetailFromPlanDetail>> | null = null;
  if (detail) {
    const targetCycleId =
      input.cycleId ??
      detail.cycles.find((c) => c.status === 'draft' || c.status === 'ready')?.id ??
      detail.cycles[0]?.id ??
      null;
    if (targetCycleId) {
      cycleDetail = await getBillingCycleDetailFromPlanDetail(context, targetCycleId, detail);
    }
  }

  const canDelete = detail
    ? (await canDeleteBillingPlan(context, detail.plan.id)).allowed
    : false;

  return {
    project,
    contracts,
    selectedContractId,
    detail,
    cycleDetail,
    orgTemplates,
    canDelete,
  };
}
