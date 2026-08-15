/** Public API of the field-ops module (Wave 3). */
export {
  createDailyLog,
  getDailyLogForOrg,
  getDailyLogLinkedToSafetyRecord,
  listDailyLogsForOrg,
  updateDailyLog,
  transitionDailyLogStatus,
  appendDailyLogCorrection,
  linkDailyLogSafetyRecord,
} from './application/daily-logs';
export {
  createPunchListItem,
  getPunchListItemForOrg,
  listPunchAssigneeOptions,
  listPunchListItemsForOrg,
  updatePunchListItem,
} from './application/punch-list';
export {
  createInspection,
  getInspectionForOrg,
  listInspectionsForOrg,
  updateInspection,
} from './application/inspections';
export {
  listInspectionFormTemplateOptions,
  getInspectionFormGateState,
} from './application/inspection-form';
export type {
  InspectionFormTemplateOption,
  InspectionFormGateState,
} from './application/inspection-form';
export { getProjectFieldOpsSummary, countOpenPunchItems, selectUpcomingInspections } from './application/project-summary';
export type { ProjectFieldOpsSummary } from './application/project-summary';
export { listFieldOpsWorkPackages } from './application/work-packages';
export type { FieldOpsWorkPackageOption } from './application/work-packages';

export {
  packWorkforceAndBlockers,
  unpackWorkforceAndBlockers,
  appendDailyLogCorrectionNote,
  DAILY_LOG_BLOCKERS_MARKER,
  DAILY_LOG_CORRECTION_MARKER,
} from './domain/daily-log-notes';

export {
  PUNCH_STATUSES,
  PUNCH_PRIORITIES,
  INSPECTION_STATUSES,
  INSPECTION_KINDS,
  DAILY_LOG_STATUSES,
} from './domain/types';
export type {
  PunchStatus,
  PunchPriority,
  InspectionStatus,
  InspectionKind,
  DailyLogStatus,
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
  isInspectionFormRequired,
  hasSubmittedInspectionForm,
  assertInspectionCompletionForm,
} from './domain/inspection-form-gate';
export type { InspectionFormSubmissionRef } from './domain/inspection-form-gate';
export {
  canTransitionDailyLogStatus,
  assertDailyLogStatusTransition,
  assertDailyLogContentMutable,
  isDailyLogLocked,
} from './domain/daily-log-status';

export {
  createDailyLogSchema,
  updateDailyLogSchema,
  transitionDailyLogStatusSchema,
  appendDailyLogCorrectionSchema,
  linkDailyLogSafetyRecordSchema,
  createPunchListItemSchema,
  updatePunchListItemSchema,
  createInspectionSchema,
  updateInspectionSchema,
} from './validation/schemas';
export type {
  CreateDailyLogInput,
  UpdateDailyLogInput,
  TransitionDailyLogStatusInput,
  AppendDailyLogCorrectionInput,
  LinkDailyLogSafetyRecordInput,
  CreatePunchListItemInput,
  UpdatePunchListItemInput,
  CreateInspectionInput,
  UpdateInspectionInput,
} from './validation/schemas';
