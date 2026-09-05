/** Public API of the workforce module (doc 76 §3). */
export { createEmployee, getEmployee, listEmployeesForOrg, listLinkableOrgMembers, updateEmployee, archiveEmployee, restoreEmployee, alignInitialCompensationToHireDate } from './application/employees';
export type { EmployeeDetail } from './application/employees';
export type { OrgMemberLinkOption } from './data/employees.repository';

export { createRateVersion, listRateHistory } from './application/rate-versions';
export type { RateVersionDetail } from './application/rate-versions';

export {
  assertCanActOnEmployeeTime,
  assertNotSelfTimeApproval,
  canReadOrgWorkforce,
  isUnrestrictedOwner,
} from './application/time-scope';

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
  recomputeMonthlyEmployeeCostForOpenMonth,
  recomputeMonthlyEmployeeCostsForDates,
  recomputeOpenMonthsAfterCompensationChange,
} from './application/monthly-cost-recompute';
export {
  recomputeDailyEmployeeCostForDate,
  recomputeDailyEmployeeCostsForDates,
  recomputeEmployeeCostsAfterTimeChange,
} from './application/daily-cost-recompute';
export {
  bootstrapOpenPeriodWorkforceCosting,
  bootstrapOpenPeriodWorkforceCostingForEmployee,
  bootstrapEmployeeOpenMonth,
} from './application/workforce-costing-bootstrap';
export type { WorkforceCostingBootstrapResult } from './application/workforce-costing-bootstrap';

export {
  createBulkTimeEntries,
  createTimeEntry,
  correctTimeEntry,
  deleteDraftTimeEntry,
  listNonProjectCodes,
  listProjectTimeEntries,
  listProjectsForTimeLog,
  listTimeEntriesForOrg,
  purgeExactDuplicateDrafts,
  resolveTimeEntryCostSnapshot,
  suggestDefaultEmployee,
  updateTimeEntry,
} from './application/time-entries';
export type { CorrectTimeEntryResult, CostSnapshot } from './application/time-entries';

export {
  buildTimeEntryDailySummaries,
} from './application/time-entry-daily-summaries';
export type { TimeEntryDailySummary } from './application/time-entry-daily-summaries';

export {
  reconcileMissingTimeEntryCosts,
  refreshTimeEntryCostSnapshotIfMissing,
  entryNeedsCostSnapshotReconcile,
  resolvePreloadedTimeEntryCost,
  shouldApplyReconcileSnapshot,
} from './application/time-entry-cost-reconcile';
export type { TimeEntryCostReconcileResult } from './application/time-entry-cost-reconcile';

export {
  approveTimeEntry,
  approveTimeEntryExcess,
  approveTimesheet,
  bulkApproveTimeEntries,
  canApproveTime,
  getTimesheetDetail,
  listTimeApprovalQueue,
  listTimesheetsForOrg,
  rejectTimeEntryExcess,
  returnTimesheet,
  submitTimeEntries,
  submitTimesheet,
} from './application/timesheets';

export {
  addProjectTeamMember,
  cancelProjectTeamAssignment,
  listAssignableProjects,
  listAssignedEmployeeIdsForProject,
  listEmployeeAssignmentHistoryLinks,
  listEmployeeProjectLinks,
  listProjectTeamHistory,
  listProjectTeamMembers,
  removeProjectTeamMember,
  updateProjectTeamAssignment,
} from './application/project-team';

export { getProjectLaborCost } from './application/project-labor-cost';
export type { ProjectLaborCostSummary } from './application/project-labor-cost';

export { loadProjectLaborByEmployee } from './data/project-labor-by-employee.repository';
export type {
  ProjectLaborByEmployeeAggregate,
  ProjectLaborEmployeePeriodRow,
  ProjectLaborEmployeeRow,
} from './data/project-labor-by-employee.repository';

/** Cross-module org-scoped lookups (FK / assignment seeds). */
export { findEmployeeById } from './data/employees.repository';
export { insertEmployeeProjectAssignment } from './data/project-team.repository';

export {
  applyManualAttendanceWorkdayRange,
  canClockAttendance,
  canManageAttendanceRecords,
  canViewAttendance,
  clockAttendance,
  getAttendanceClockSurface,
  getAttendanceDayDetail,
  listAttendanceDaysForOrg,
  listEmployeesWithoutAttendanceToday,
  previewManualAttendanceWorkdayRange,
  recordManualAttendanceEvent,
  replaceAttendanceEvent,
  requiresAttendanceOverwriteApproval,
  voidAttendanceDay,
  voidAttendanceEvent,
} from './application/attendance';
export {
  getMonthlyAttendanceGrid,
  getTodayAttendanceOverview,
} from './application/attendance-owner-views';
export type {
  MonthlyAttendanceCell,
  MonthlyAttendanceEmployeeRow,
  MonthlyAttendanceGrid,
  MonthlyCellKind,
  TodayApprovalStatus,
  TodayAttendanceOverview,
  TodayAttendanceRow,
} from './application/attendance-owner-views';
export type {
  AttendanceApplyOptions,
  AttendanceApplyRollbackProbe,
  AttendanceClockSurface,
  AttendanceOverwriteSummary,
  AttendanceWorkdayRangePreview,
  AttendanceWorkdayRangeResult,
  AttendanceWorkdayWriteOutcome,
} from './application/attendance';

export {
  addProjectTeamMemberSchema,
  applyMonthlyEmployerCostAllocationSchema,
  attendanceFiltersSchema,
  cancelProjectTeamAssignmentSchema,
  clockAttendanceSchema,
  correctTimeEntrySchema,
  createBulkTimeEntriesSchema,
  createEmployeeSchema,
  createRateVersionSchema,
  createTimeEntrySchema,
  loadMonthlyEmployerCostReviewSchema,
  manualAttendanceEventSchema,
  manualAttendanceWorkdayRangeSchema,
  removeProjectTeamMemberSchema,
  replaceAttendanceEventSchema,
  saveMonthlyEmployerCostDraftSchema,
  timeEntryFiltersSchema,
  timesheetFiltersSchema,
  updateEmployeeSchema,
  updateProjectTeamAssignmentSchema,
  updateTimeEntrySchema,
  submitTimesheetSchema,
  submitTimeEntriesSchema,
  returnTimesheetSchema,
  approveTimesheetSchema,
  approveTimeEntrySchema,
  bulkApproveTimeEntriesSchema,
  deleteDraftTimeEntrySchema,
  excessTimeEntryDecisionSchema,
  voidAttendanceDaySchema,
  voidAttendanceEventSchema,
} from './validation/schemas';
export type {
  AddProjectTeamMemberInput,
  ApplyMonthlyEmployerCostAllocationInput,
  AttendanceFiltersInput,
  ApproveTimeEntryInput,
  ApproveTimesheetInput,
  BulkApproveTimeEntriesInput,
  CancelProjectTeamAssignmentInput,
  ClockAttendanceInput,
  CorrectTimeEntryInput,
  CreateBulkTimeEntriesInput,
  CreateEmployeeInput,
  CreateRateVersionInput,
  CreateTimeEntryInput,
  LoadMonthlyEmployerCostReviewInput,
  ManualAttendanceEventInput,
  RemoveProjectTeamMemberInput,
  ReplaceAttendanceEventInput,
  ReturnTimesheetInput,
  SaveMonthlyEmployerCostDraftInput,
  SubmitTimeEntriesInput,
  SubmitTimesheetInput,
  TimeEntryFiltersInput,
  TimesheetFiltersInput,
  UpdateEmployeeInput,
  UpdateProjectTeamAssignmentInput,
  UpdateTimeEntryInput,
  VoidAttendanceDayInput,
  VoidAttendanceEventInput,
} from './validation/schemas';

export { calculateLaborCost, calculateLaborCostTotal, hoursToRateUnits } from './domain/labor-cost';
export {
  TIMESHEET_TRANSITIONS,
  assertTimeApprovalTransition,
  assertTimeEntryHoursEditable,
  assertTimesheetTransition,
  canEditTimeEntryHours,
  canSubmitApprovalStatus,
  canTransitionTimeApprovalStatus,
  canTransitionTimesheetStatus,
  contributesLaborActual,
  isApprovedRecordedLocked,
  timesheetPeriodForWorkDate,
} from './domain/timesheet-lifecycle';
export { resolveRateVersionForDate, resolveCurrentCompensationForDisplay } from './domain/rate-lookup';
export {
  TIME_CORRECTION_AMOUNT_SENTINEL_RATE,
  resolveTimeCorrectionApprovalAmount,
} from './domain/time-correction-approval';
export {
  buildEmployeeArchivePatch,
  buildEmployeeRestorePatch,
  isEmployeeSoftArchived,
} from './domain/soft-archive';
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
  TIME_APPROVAL_STATUSES,
  TIME_ENTRY_KINDS,
  TIME_ENTRY_STATUSES,
  TIMESHEET_STATUSES,
} from './domain/types';
export type {
  AttendanceDayDetail,
  AttendanceDayListItem,
  AttendanceDayRecord,
  AttendanceEventRecord,
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
  TimeApprovalStatus,
  TimeEntryKind,
  TimeEntryListItem,
  TimeEntryRecord,
  TimeEntryStatus,
  TimesheetListItem,
  TimesheetRecord,
  TimesheetStatus,
} from './domain/types';

export {
  canClockIn,
  canClockOut,
  deriveAttendanceDayStatus,
  listActiveAttendanceEvents,
  resolveClockPresenceState,
  ATTENDANCE_DAY_STATUSES,
  ATTENDANCE_EVENT_SOURCES,
  ATTENDANCE_EVENT_TYPES,
  CLOCK_PRESENCE_STATES,
} from './domain/attendance';
export type {
  AttendanceDayStatus,
  AttendanceEventSource,
  AttendanceEventType,
  ClockPresenceState,
} from './domain/attendance';

export {
  ALL_WEEKDAYS,
  WEEKDAY_WORKDAYS,
  expandBulkWorkDates,
  expandWorkDatesInRange,
  previewBulkTimeEntries,
} from './domain/bulk-time-expand';
export type { BulkDayHours, WeekdayIndex } from './domain/bulk-time-expand';

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
  sumOrganizationNonProjectLaborCost,
  sumNonProjectLaborCostByMonth,
  sumTimeLaborPeriodReconciliation,
} from './data/time-entries.repository';
export type {
  NonProjectLaborCostAggregate,
  TimeLaborPeriodReconciliation,
} from './data/time-entries.repository';

/** Monthly allocation Displacement rollups (applied/closed months only). */
export {
  listDisplacedEmployeeMonthKeys,
  sumMonthlyAllocatedLaborByProject,
  sumMonthlyAllocatedLaborForProject,
  sumOrganizationMonthlyLaborUnallocated,
  sumOrganizationMonthlyLaborUnallocatedByMonth,
} from './data/labor-displacement.repository';
export type { MonthlyAllocatedLaborAggregate } from './data/labor-displacement.repository';
