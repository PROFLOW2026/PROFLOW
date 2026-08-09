/** Public API of the field-ops module (Wave 3). */
export { createDailyLog, listDailyLogsForOrg, updateDailyLog } from './application/daily-logs';
export {
  createPunchListItem,
  listPunchListItemsForOrg,
  updatePunchListItem,
} from './application/punch-list';
export {
  createInspection,
  listInspectionsForOrg,
  updateInspection,
} from './application/inspections';

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
