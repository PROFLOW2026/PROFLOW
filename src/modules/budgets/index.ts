/** Public API of the budgets module (next-gen Agent 4). */
export { getProjectBudgetWorkspace } from './application/queries';
export type { ProjectBudgetWorkspace } from './application/queries';

export { createProjectBudget, reviseProjectBudget } from './application/manage-budget';

export {
  composeBudgetControlPosition,
  computeBudgetVariance,
  moneyFromBudgetAmount,
} from './domain/variance';
export type { BudgetControlPosition, ComposeBudgetControlInput } from './domain/variance';

export {
  BUDGET_STATUSES,
  BUDGET_LINE_TYPES,
  BUDGET_AUDIT_ACTIONS,
  resolveBudgetMode,
} from './domain/types';
export type {
  BudgetStatus,
  BudgetLineType,
  BudgetMode,
  ProjectBudgetRecord,
  ProjectBudgetLineRecord,
  ProjectBudgetRevisionRecord,
} from './domain/types';

export {
  createProjectBudgetSchema,
  reviseProjectBudgetSchema,
  budgetLineInputSchema,
} from './validation/schemas';
export type {
  CreateProjectBudgetInput,
  ReviseProjectBudgetInput,
  BudgetLineInput,
} from './validation/schemas';
