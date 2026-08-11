import { getProjectFinancials } from '@/modules/financials';
import type { CostPosition } from '@/modules/financials/domain/types';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { fromNumericString, sumMoney, zeroMoney } from '@/shared/money/money';
import {
  composeBudgetControlPosition,
  type BudgetControlPosition,
} from '../domain/variance';
import {
  resolveBudgetMode,
  type BudgetMode,
  type ProjectBudgetLineRecord,
  type ProjectBudgetRecord,
  type ProjectBudgetRevisionRecord,
} from '../domain/types';
import {
  findActiveBudgetForProject,
  listBudgetLinesForRevision,
  listBudgetRevisions,
} from '../data/budgets.repository';
import { findProjectById } from '@/modules/projects';

export interface ProjectBudgetWorkspace {
  readonly budget: ProjectBudgetRecord | null;
  readonly mode: BudgetMode | null;
  readonly lines: readonly ProjectBudgetLineRecord[];
  readonly revisions: readonly ProjectBudgetRevisionRecord[];
  readonly control: BudgetControlPosition | null;
  readonly cost: CostPosition | null;
  readonly canManage: boolean;
  readonly hasEngineActual: boolean;
}

function sumLineBudgets(
  lines: readonly ProjectBudgetLineRecord[],
  currency: string,
) {
  const values = lines
    .map((line) => fromNumericString(line.budgetAmount, currency))
    .filter((value): value is NonNullable<typeof value> => value !== null);
  return values.length === 0 ? zeroMoney(currency) : sumMoney(values, currency);
}

export async function getProjectBudgetWorkspace(
  context: OrgContext,
  projectId: string,
): Promise<ProjectBudgetWorkspace> {
  assertPermission(context, PERMISSIONS.BUDGETS_READ);

  const project = await findProjectById(context.db, context.organizationId, projectId);
  const exists = Boolean(project && !project.archivedAt);
  if (!exists) throw new NotFoundError('Project');

  const budget = await findActiveBudgetForProject(
    context.db,
    context.organizationId,
    projectId,
  );

  const canManage = hasPermission(context, PERMISSIONS.BUDGETS_MANAGE);
  const canReadFinancials = hasPermission(context, PERMISSIONS.PROJECT_FINANCIALS_READ);

  let cost: CostPosition | null = null;
  if (canReadFinancials) {
    const financials = await getProjectFinancials(context, projectId);
    cost = financials.cost;
  }

  if (!budget) {
    return {
      budget: null,
      mode: null,
      lines: [],
      revisions: [],
      control: null,
      cost,
      canManage,
      hasEngineActual: cost !== null,
    };
  }

  const [lines, revisions] = await Promise.all([
    listBudgetLinesForRevision(
      context.db,
      context.organizationId,
      budget.id,
      budget.currentRevisionNumber,
    ),
    listBudgetRevisions(context.db, context.organizationId, budget.id),
  ]);

  const currency = budget.currency;
  const budgetTotal =
    fromNumericString(budget.totalBudgetAmount, currency) ??
    sumLineBudgets(lines, currency);

  const control = composeBudgetControlPosition({
    budgetAmount: budgetTotal,
    currency,
    cost,
  });

  return {
    budget,
    mode: resolveBudgetMode(lines),
    lines,
    revisions,
    control,
    cost,
    canManage,
    hasEngineActual: cost !== null,
  };
}
