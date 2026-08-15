import {
  getProjectFinancials,
  loadProjectExpenseContributions,
  loadRecognizedVendorBillsForProject,
  type CostPosition,
  type ProjectExpenseContribution,
} from '@/modules/financials';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError } from '@/shared/errors';
import { assertPermission, hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { fromNumericString, isZeroMoney, sumMoney, zeroMoney } from '@/shared/money/money';
import {
  mapBudgetLineActuals,
  type BudgetLineControlRow,
} from '../domain/map-line-actuals';
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
  listActiveBudgetAmountsForOrg,
  listBudgetLinesForRevision,
  listBudgetRevisions,
} from '../data/budgets.repository';
import { findProjectById } from '@/modules/projects';

export async function getActiveBudgetForProject(context: OrgContext, projectId: string) {
  return findActiveBudgetForProject(context.db, context.organizationId, projectId);
}

export async function getActiveBudgetAmountsForOrg(
  context: OrgContext,
): Promise<Map<string, { amount: string; currency: string }>> {
  if (!hasPermission(context, PERMISSIONS.BUDGETS_READ)) return new Map();
  return listActiveBudgetAmountsForOrg(context.db, context.organizationId);
}

export interface ProjectBudgetWorkspace {
  readonly budget: ProjectBudgetRecord | null;
  readonly mode: BudgetMode | null;
  readonly lines: readonly ProjectBudgetLineRecord[];
  readonly lineControls: readonly BudgetLineControlRow[];
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
  options?: {
    /**
     * Request-cached engine cost (from `loadProjectFinancials`). When set,
     * skip the in-function `getProjectFinancials` call. A Promise overlaps
     * with budget/expense queries in the same tx.
     */
    costPromise?: Promise<CostPosition | null>;
  },
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
  const canReadExpenses = hasPermission(context, PERMISSIONS.EXPENSES_READ);

  let cost: CostPosition | null = null;
  let contributions: readonly ProjectExpenseContribution[] | null = null;
  let linkedExpenseIds: ReadonlySet<string> | undefined;
  let excludeLaborCategory = false;
  if (canReadFinancials) {
    const canReadAp = hasPermission(context, PERMISSIONS.AP_READ);
    const [engineCost, expenseSlices, recognizedVendor] = await Promise.all([
      options?.costPromise ??
        getProjectFinancials(context, projectId).then((financials) => financials.cost),
      canReadExpenses
        ? loadProjectExpenseContributions(context.db, context.organizationId, projectId)
        : Promise.resolve(null),
      canReadAp
        ? loadRecognizedVendorBillsForProject(
            context.db,
            context.organizationId,
            projectId,
            context.organization.baseCurrency,
          )
        : Promise.resolve(null),
    ]);
    cost = engineCost;
    contributions = expenseSlices;
    linkedExpenseIds = recognizedVendor?.linkedExpenseIds;
    excludeLaborCategory = Boolean(cost && !isZeroMoney(cost.laborActual));
  }

  if (!budget) {
    return {
      budget: null,
      mode: null,
      lines: [],
      lineControls: [],
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

  const { rows: lineControls } = mapBudgetLineActuals({
    currency,
    lines,
    cost,
    contributions,
    linkedExpenseIds,
    excludeLaborCategory,
  });

  return {
    budget,
    mode: resolveBudgetMode(lines),
    lines,
    lineControls,
    revisions,
    control,
    cost,
    canManage,
    hasEngineActual: cost !== null,
  };
}
