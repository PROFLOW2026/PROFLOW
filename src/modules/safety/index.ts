/** Public API of the safety / HSE module. No UI - import components from `./ui`. */
export {
  listSafetyRecordsForOrg,
  getSafetyRecordForOrg,
  createSafetyRecord,
  updateSafetyRecord,
} from './application/records';
export { createCorrectiveAction, updateCorrectiveAction } from './application/actions';
export { addToolboxAttendee, acknowledgeToolboxAttendee } from './application/toolbox';
export {
  getSafetySummaryForOrg,
  loadOverdueSafetyActionsForOrg,
} from './application/summary';
export { attachDocumentToSafetyRecord } from './application/attach-document';

export {
  isCorrectiveActionOverdue,
  listOverdueSafetyActions,
} from './domain/overdue';
export type { SafetyActionOverdueInput } from './domain/overdue';

export {
  SAFETY_RECORD_TYPES,
  SAFETY_SEVERITIES,
  SAFETY_RECORD_STATUSES,
  SAFETY_ACTION_STATUSES,
  SAFETY_RECORD_DOCUMENT_OWNER,
} from './domain/types';
export type {
  SafetyRecordType,
  SafetySeverity,
  SafetyRecordStatus,
  SafetyActionStatus,
  SafetyRecordRecord,
  SafetyCorrectiveActionRecord,
  SafetyToolboxTalkRecord,
  SafetyToolboxAttendeeRecord,
  SafetyRecordDetail,
  SafetyListFilters,
  SafetySummary,
} from './domain/types';

export {
  canTransitionSafetyRecordStatus,
  assertSafetyRecordStatusTransition,
  canTransitionSafetyActionStatus,
  assertSafetyActionStatusTransition,
  isOpenSafetyRecordStatus,
  isOpenSafetyActionStatus,
  closedAtForSafetyRecordStatus,
  closedAtForSafetyActionStatus,
} from './domain/status';

export { belongsToOrganization } from './domain/overdue';
export { requireOrgRow, selectOrgRows } from './domain/scope';

export {
  createSafetyRecordSchema,
  updateSafetyRecordSchema,
  createCorrectiveActionSchema,
  updateCorrectiveActionSchema,
  addToolboxAttendeeSchema,
  acknowledgeToolboxAttendeeSchema,
} from './validation/schemas';
export type {
  CreateSafetyRecordInput,
  UpdateSafetyRecordInput,
  CreateCorrectiveActionInput,
  UpdateCorrectiveActionInput,
  AddToolboxAttendeeInput,
  AcknowledgeToolboxAttendeeInput,
} from './validation/schemas';
