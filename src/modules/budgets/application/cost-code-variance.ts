import { listBusinessCatalog } from '@/modules/business-catalog/application/manage-catalog';
import { findProjectById } from '@/modules/projects';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  loadActualAmountsByCostCodeForProject,
  loadBudgetAmountsByCostCodeForProject,
  loadCommittedAmountsByCostCodeForProject,
  loadUnattributedActualForProject,
} from '../data/cost-code-attribution.repository';
import { findActiveBudgetForProject } from '../data/budgets.repository';
import {
  composeCostCodeVariance,
  sumCostCodeVarianceTotals,
  type CostCodeVarianceResult,
} from '../domain/cost-code-variance';

export interface ProjectCostCodeVarianceView extends CostCodeVarianceResult {
  readonly projectId: string;
  readonly budgetCurrency: string;
  readonly canReadCommitted: boolean;
  readonly canReadActual: boolean;
  readonly totals: ReturnType<typeof sumCostCodeVarianceTotals>;
}

/**
 * Budget vs Committed (PO lines) vs Actual (expense allocations + AP lines) by cost code.
 * Uses existing budget + procurement + expense/AP rows — not a second accounting engine.
 */
export async function getProjectCostCodeVariance(
  context: OrgContext,
  projectId: string,
): Promise<ProjectCostCodeVarianceView> {
  assertPermission(context, PERMISSIONS.BUDGETS_READ);

  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project || project.archivedAt) throw new NotFoundError('Project');

  const budget = await findActiveBudgetForProject(
    context.db,
    context.organizationId,
    projectId,
  );
  const currency = (budget?.currency ?? project.currency ?? context.organization.baseCurrency).toUpperCase();

  const canReadCommitted = hasPermission(context, PERMISSIONS.PROCUREMENT_READ);
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);
  const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
  const canReadActual = canReadExpenses || canReadAp;

  const [budgetSlices, committedSlices, actualSlices, catalogEntries, unattributedActual] =
    await Promise.all([
      loadBudgetAmountsByCostCodeForProject(context.db, context.organizationId, projectId),
      canReadCommitted
        ? loadCommittedAmountsByCostCodeForProject(context.db, context.organizationId, projectId)
        : Promise.resolve([]),
      canReadActual
        ? loadActualAmountsByCostCodeForProject(context.db, context.organizationId, projectId)
        : Promise.resolve([]),
      listBusinessCatalog(context, 'cost_code').catch(() => []),
      canReadActual
        ? loadUnattributedActualForProject(context.db, context.organizationId, projectId, currency)
        : Promise.resolve('0'),
    ]);

  const catalogLabels = new Map(
    catalogEntries.map((entry) => [entry.id, { key: entry.key, name: entry.name }]),
  );

  const composed = composeCostCodeVariance({
    currency,
    budgetSlices,
    committedSlices,
    actualSlices,
    catalogLabels,
    unattributedActualAmount: unattributedActual,
  });

  return {
    ...composed,
    projectId,
    budgetCurrency: currency,
    canReadCommitted,
    canReadActual,
    totals: sumCostCodeVarianceTotals(composed.rows, currency),
  };
}
