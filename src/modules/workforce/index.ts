/** Public API of the workforce module (doc 76 §3). */
export { createEmployee, getEmployee, listEmployeesForOrg, updateEmployee, archiveEmployee } from './application/employees';
export type { EmployeeDetail } from './application/employees';

export { createRateVersion, listRateHistory } from './application/rate-versions';
export type { RateVersionDetail } from './application/rate-versions';

export {
  assertCanManageWorkforceCost,
  assertCanReadWorkforceCost,
  canManageWorkforceCost,
  canReadWorkforceCost,
} from './application/workforce-cost-authz';

export {
  assertEmployeeMonthCostReadable,
  assertEmployeeMonthCostWritable,
  assertLaborAllocationReadable,
  assertLaborAllocationWritable,
  applyMonthlyEmployerCostAllocation,
  loadMonthlyEmployerCostReview,
  saveMonthlyEmployerCostDraft,
} from './application/employer-month-costs';
export type { MonthlyEmployerCostReview } from './application/employer-month-costs';

export {
  createTimeEntry,
  listNonProjectCodes,
  listProjectTimeEntries,
  listTimeEntriesForOrg,
  resolveTimeEntryCostSnapshot,
  suggestDefaultEmployee,
} from './application/time-entries';
export type { CostSnapshot } from './application/time-entries';

export {
  addProjectTeamMember,
  listAssignableProjects,
  listAssignedEmployeeIdsForProject,
  listEmployeeAssignmentHistoryLinks,
  listEmployeeProjectLinks,
  listProjectTeamHistory,
  listProjectTeamMembers,
  removeProjectTeamMember,
} from './application/project-team';

export { getProjectLaborCost } from './application/project-labor-cost';
export type { ProjectLaborCostSummary } from './application/project-labor-cost';

export {
  addProjectTeamMemberSchema,
  applyMonthlyEmployerCostAllocationSchema,
  createEmployeeSchema,
  createRateVersionSchema,
  createTimeEntrySchema,
  loadMonthlyEmployerCostReviewSchema,
  removeProjectTeamMemberSchema,
  saveMonthlyEmployerCostDraftSchema,
  timeEntryFiltersSchema,
  updateEmployeeSchema,
} from './validation/schemas';
export type {
  AddProjectTeamMemberInput,
  ApplyMonthlyEmployerCostAllocationInput,
  CreateEmployeeInput,
  CreateRateVersionInput,
  CreateTimeEntryInput,
  LoadMonthlyEmployerCostReviewInput,
  RemoveProjectTeamMemberInput,
  SaveMonthlyEmployerCostDraftInput,
  TimeEntryFiltersInput,
  UpdateEmployeeInput,
} from './validation/schemas';

export { calculateLaborCost, calculateLaborCostTotal, hoursToRateUnits } from './domain/labor-cost';
export { resolveRateVersionForDate } from './domain/rate-lookup';
export {
  displacedEmployeeMonthKey,
  hasWorkforceLaborData,
  isTimeEntryDisplacedByMonth,
  mergeResidualTimeAndMonthlyAllocatedLabor,
  yearMonthFromWorkDate,
} from './domain/labor-recognition';
export {
  COMPENSATION_SOURCES,
  EMPLOYER_COST_QUALITIES,
  compensationSemanticsFromRateVersion,
  isCompensationVersionMutable,
  isEmployerCostMonthMutable,
} from './domain/compensation';
export type {
  CompensationMoneySemantics,
  CompensationSource,
  CompensationVersionDetail,
  CompensationVersionRecord,
  EmployerCostMonthRecord,
  EmployerCostQuality,
  EmploymentBasis,
} from './domain/compensation';
export {
  DEFAULT_NON_PROJECT_TIME_CODES,
  EMPLOYEE_PROJECT_ASSIGNMENT_STATUSES,
  RATE_UNITS,
} from './domain/types';
export type {
  EmployeeAssignmentLink,
  EmployeeListItem,
  EmployeeProjectAssignmentRecord,
  EmployeeProjectAssignmentStatus,
  EmployeeProjectAssignmentSummary,
  EmployeeProjectLink,
  EmployeeRecord,
  ProjectTeamMemberRecord,
  ProjectTeamMemberSummary,
  RateUnit,
  TimeEntryListItem,
  TimeEntryRecord,
} from './domain/types';

export {
  EMPLOYEE_MONTH_COSTS_READY,
  MONTHLY_ALLOCATION_METHODS,
  areEmployeeMonthCostsAvailable,
  previewMonthlyCostStrip,
  setEmployeeMonthCostsReadyForTests,
} from './domain/monthly-cost-gates';
export type {
  MonthlyAllocationMethod,
  MonthlyCostReviewDraft,
} from './domain/monthly-cost-gates';

export {
  deriveKnownEmployerCost,
  resolveMonthlyAllocationAmounts,
} from './domain/monthly-allocation';
export type {
  MonthlyAllocationLineInput,
  MonthlyAllocationResolution,
  ResolvedMonthlyAllocationLine,
} from './domain/monthly-allocation';

export { loadQuickLogFormData } from './application/quick-log';
export type { QuickLogFormData } from './application/quick-log';

/** Cross-module time-entry lookups (offline sync / dashboard labor / financial batch). */
export {
  findTimeEntryById,
  sumLaborCostGroupedByProject,
  sumOrganizationProjectLaborCoverage,
} from './data/time-entries.repository';

/** Monthly allocation Displacement rollups (applied/closed months only). */
export {
  listDisplacedEmployeeMonthKeys,
  sumMonthlyAllocatedLaborByProject,
  sumMonthlyAllocatedLaborForProject,
  sumOrganizationMonthlyLaborUnallocated,
} from './data/labor-displacement.repository';
export type { MonthlyAllocatedLaborAggregate } from './data/labor-displacement.repository';
