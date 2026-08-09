/** Public API of the field-ops module (Wave 3). */
export {
  createDailyLog,
  getDailyLogForOrg,
  listDailyLogsForOrg,
  updateDailyLog,
} from './application/daily-logs';
export {
  createPunchListItem,
  getPunchListItemForOrg,
  listPunchListItemsForOrg,
  updatePunchListItem,
} from './application/punch-list';
export {
  createInspection,
  getInspectionForOrg,
  listInspectionsForOrg,
  updateInspection,
} from './application/inspections';
export { getProjectFieldOpsSummary, countOpenPunchItems, selectUpcomingInspections } from './application/project-summary';
export type { ProjectFieldOpsSummary } from './application/project-summary';
export { listFieldOpsWorkPackages } from './application/work-packages';
export type { FieldOpsWorkPackageOption } from './application/work-packages';

export {
  packWorkforceAndBlockers,
  unpackWorkforceAndBlockers,
  DAILY_LOG_BLOCKERS_MARKER,
} from './domain/daily-log-notes';

export {
  PUNCH_STATUSES,
  PUNCH_PRIORITIES,
  INSPECTION_STATUSES,
  INSPECTION_KINDS,
} from './domain/types';
export type {
  PunchStatus,
  PunchPriority,
  InspectionStatus,
  InspectionKind,
  DailyLogRecord,
  PunchListItemRecord,
  InspectionRecord,
} from './domain/types';

export {
  canTransitionPunchStatus,
  assertPunchStatusTransition,
  isTerminalPunchStatus,
  closedAtForPunchStatus,
} from './domain/punch-status';
export {
  canTransitionInspectionStatus,
  assertInspectionStatusTransition,
  isTerminalInspectionStatus,
  isCompletedInspectionStatus,
} from './domain/inspection-status';

export {
  createDailyLogSchema,
  updateDailyLogSchema,
  createPunchListItemSchema,
  updatePunchListItemSchema,
  createInspectionSchema,
  updateInspectionSchema,
} from './validation/schemas';
export type {
  CreateDailyLogInput,
  UpdateDailyLogInput,
  CreatePunchListItemInput,
  UpdatePunchListItemInput,
  CreateInspectionInput,
  UpdateInspectionInput,
} from './validation/schemas';
