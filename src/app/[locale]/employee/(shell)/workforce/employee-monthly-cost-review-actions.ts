import {
  employeeApplyMonthlyEmployerCostAllocationAction,
  employeeCorrectMonthlyEmployerCostActualAction,
  employeeLoadMonthlyEmployerCostReviewAction,
  employeeReturnMonthlyEmployerCostToEstimateAction,
  employeeSaveMonthlyEmployerCostDraftAction,
} from './actions';

/** Bundled for MonthlyEmployerCostReview — must not live in a `use server` file. */
export const employeeMonthlyEmployerCostReviewActions = {
  loadMonthlyEmployerCostReviewAction: employeeLoadMonthlyEmployerCostReviewAction,
  saveMonthlyEmployerCostDraftAction: employeeSaveMonthlyEmployerCostDraftAction,
  applyMonthlyEmployerCostAllocationAction: employeeApplyMonthlyEmployerCostAllocationAction,
  correctMonthlyEmployerCostActualAction: employeeCorrectMonthlyEmployerCostActualAction,
  returnMonthlyEmployerCostToEstimateAction: employeeReturnMonthlyEmployerCostToEstimateAction,
} as const;
