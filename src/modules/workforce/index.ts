/** Public API of the workforce module (doc 76 §3). */
export { createEmployee, getEmployee, listEmployeesForOrg, updateEmployee, archiveEmployee } from './application/employees';
export type { EmployeeDetail } from './application/employees';

export { createRateVersion, listRateHistory } from './application/rate-versions';
export type { RateVersionDetail } from './application/rate-versions';

export {
  createTimeEntry,
  listNonProjectCodes,
  listProjectTimeEntries,
  listTimeEntriesForOrg,
  resolveTimeEntryCostSnapshot,
  suggestDefaultEmployee,
} from './application/time-entries';
export type { CostSnapshot } from './application/time-entries';

export { getProjectLaborCost } from './application/project-labor-cost';
export type { ProjectLaborCostSummary } from './application/project-labor-cost';

export {
  createEmployeeSchema,
  createRateVersionSchema,
  createTimeEntrySchema,
  timeEntryFiltersSchema,
  updateEmployeeSchema,
} from './validation/schemas';
export type {
  CreateEmployeeInput,
  CreateRateVersionInput,
  CreateTimeEntryInput,
  TimeEntryFiltersInput,
  UpdateEmployeeInput,
} from './validation/schemas';

export { calculateLaborCost, calculateLaborCostTotal, hoursToRateUnits } from './domain/labor-cost';
export { resolveRateVersionForDate } from './domain/rate-lookup';
export { DEFAULT_NON_PROJECT_TIME_CODES, RATE_UNITS } from './domain/types';
export type { EmployeeListItem, EmployeeRecord, RateUnit, TimeEntryListItem, TimeEntryRecord } from './domain/types';

export { loadQuickLogFormData } from './application/quick-log';
export type { QuickLogFormData } from './application/quick-log';

/** Cross-module time-entry lookups (offline sync / dashboard labor). */
export {
  findTimeEntryById,
  sumOrganizationProjectLaborCoverage,
} from './data/time-entries.repository';
