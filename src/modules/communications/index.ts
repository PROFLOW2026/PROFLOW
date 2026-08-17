export type {
  CommunicationAttemptRecord,
  CommunicationAttachmentRecord,
  CommunicationDetail,
  CommunicationEntityType,
  CommunicationStatus,
  OutboundCommunicationRecord,
} from './domain/types';
export {
  COMMUNICATION_ATTEMPT_RESULTS,
  COMMUNICATION_ENTITY_TYPES,
  COMMUNICATION_STATUSES,
} from './domain/types';
export { canMarkCommunicationSent, resolveSendOutcome } from './domain/send-policy';
export {
  saveCommunicationDraft,
  queueCommunication,
  cancelCommunication,
  listCommunications,
  getCommunication,
} from './application/manage';
export { sendCommunication, retryCommunication } from './application/send';
export {
  saveCommunicationDraftSchema,
  communicationIdSchema,
  listCommunicationsSchema,
} from './validation/schemas';
export type {
  SaveCommunicationDraftInput,
  ListCommunicationsInput,
} from './validation/schemas';
