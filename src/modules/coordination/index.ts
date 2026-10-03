import './register-ports';

/**
 * Coordination events / contractor readiness / schedule (Developer / GC, Track H).
 *
 * Internal (OrgContext + project capabilities schedule.* / contractor.coordinate) and contractor
 * portal (ExternalContext + ext.schedule.view / ext.event.respond) use-cases.
 */
export {
  createCoordinationEvent,
  createCoordinationFollowUpTask,
  dismissCoordinationIssue,
  inviteCoordinationParticipants,
  linkCoordinationDocument,
  overrideCoordinationReadiness,
  recordCoordinationOutcome,
  recordResponseOnBehalf,
  requestCoordinationReadiness,
  rescheduleCoordinationEvent,
  unlinkCoordinationDocument,
  updateCoordinationEventDetails,
  updateCoordinationParticipant,
  type CoordinationTaskDeps,
} from './application/manage-events';
export {
  getCoordinationEventDetail,
  listCoordinationCalendarItems,
  listProjectCoordinationEvents,
  loadCoordinationFormOptions,
  type CoordinationFormOptions,
  type ListCoordinationEventsOptions,
} from './application/queries';
export {
  getContractorCoordinationSummary,
  getContractorEventDetail,
  listContractorSchedule,
  respondToCoordinationEvent,
} from './application/external';
export { coordinationAccess } from './application/authorization';
export { listParticipants } from './data/coordination.repository';
export {
  computeEventReadiness,
  isReadyState,
  type EventReadiness,
  type EventReadinessState,
  type PartyReadiness,
  type PartyReadinessState,
} from './domain/readiness';
export type * from './domain/types';
export type {
  CreateCoordinationEventInput,
  CreateFollowUpTaskInput,
  InviteParticipantsInput,
  OverrideReadinessInput,
  RecordOutcomeInput,
  RescheduleEventInput,
  RespondToEventInput,
  UpdateCoordinationEventInput,
} from './validation/schemas';
