export { createExpense } from './application/create-expense';
export { updateExpense } from './application/update-expense';
export { finalizeExpense } from './application/finalize-expense';
export { voidExpense } from './application/void-expense';
export { createExpenseReversal } from './application/create-expense-reversal';
export { createExpenseAdjustment } from './application/create-expense-adjustment';
export type { ExpenseAdjustmentResult } from './application/create-expense-adjustment';
export { getExpenseCorrectionChain } from './application/get-expense-correction-chain';
export type { ExpenseCorrectionChain } from './application/get-expense-correction-chain';
export {
  resolveCorrectionOriginalId,
  sumCorrectionChainNet,
} from './domain/corrections';
export type { CorrectionChainEntry, CorrectionChainRole } from './domain/corrections';
export { resolveTaxAmounts, inferExpenseTaxModeFromAmounts, captureTaxSnapshot } from './domain/tax';
export { runAutomaticAllocation } from './application/run-automatic-allocation';
export {
  getExpense,
  listExpensesForOrg,
  listCostCategoriesForOrg,
  listProjectsForOrg,
  listWorkPackagesForOrg,
} from './application/queries';
export { getOverheadHome } from './application/get-overhead-home';
export type { OverheadHomeResult } from './application/get-overhead-home';
export { canAccessOverheadHome, OVERHEAD_HOME_COST_FAMILIES } from './domain/overhead-home';
export type { OverheadHomeCostFamily, OverheadAllocationRunSummary } from './domain/overhead-home';
export type {
  CostFamily,
  CategoryPeriodBehavior,
  CostCategoryRow,
  ExpenseDetail,
  ExpenseSummary,
  ExpenseStatus,
  RecurrenceCadence,
  AllocationLineInput,
  AllocationMethod,
  AllocationScheduleMode,
  WeightAllocationMethod,
  AllocationRunExplanation,
} from './domain/types';
export { CATEGORY_PERIOD_BEHAVIORS } from './domain/types';
export {
  allocateByProjectWeights,
  resolveAllocationLines,
  equalSplitBases,
} from './domain/allocation';
export {
  selectEligibleProjects,
  selectEligibleProjectsForMethod,
  isProjectEligibleInPeriod,
  countInclusiveDays,
  projectActiveDaysInSlice,
  projectActiveFractionOfSlice,
  applyActiveDayExposureToBases,
  activeDayExposurePolicyForMethod,
} from './domain/allocation-eligibility';
export {
  classifyExpenseCost,
  resolveAllocationMethodPolicy,
  ORG_ALLOCATION_DEFAULT_METHOD_KEY,
} from './domain/allocation-policy';
export {
  buildAllocationSlices,
  splitSourceNetAcrossSlices,
  aggregateSliceAllocationLines,
  planSlicesWithFrozenHistory,
  enumerateCalendarMonthWindows,
  scheduleModeFromCategoryPeriodBehavior,
} from './domain/allocation-schedule';
export {
  createExpenseSchema,
  createExpenseAdjustmentSchema,
  updateExpenseSchema,
  expenseIdSchema,
  listExpensesSchema,
  runAllocationSchema,
  parseAllocationsFromForm,
} from './validation/schemas';
export type {
  CreateExpenseInput,
  CreateExpenseAdjustmentInput,
  UpdateExpenseInput,
  ListExpensesInput,
  RunAllocationInput,
} from './validation/schemas';

/** Cross-module org-scoped lookups (FK / tenancy guards). */
export { findExpenseById } from './data/expenses.repository';
