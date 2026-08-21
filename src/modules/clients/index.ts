/** Public API of the clients module. */
export { createClient } from './application/create-client';
export { updateClient } from './application/update-client';
export { archiveClient, restoreClient } from './application/archive-client';
export {
  listClientsForOrg,
  getClientById,
  listContactsForClient,
  listContactsForClients,
  getPracticalContactForClient,
  getClientContactById,
  loadDisplayContactForProject,
} from './application/list-clients';
export {
  createClientContact,
  updateClientContact,
  removeClientContact,
  markClientContactAsPrimary,
  upsertClientPartyIdentifier,
  removeClientPartyIdentifier,
} from './application/manage-contacts';
export { getClientFinancials } from './application/get-client-financials';
export type { ClientFinancialView } from './application/get-client-financials';
export { findClientById } from './data/clients.repository';
export { getClientTimeline, recordActivityEvent } from './application/timeline';
export type { ClientTimelineView } from './application/timeline';
export type { ClientTimelineEventView } from './domain/timeline';
export {
  TIMELINE_CATEGORIES,
  TIMELINE_EVENT_KINDS,
  TIMELINE_SORT_DIRECTIONS,
  filterTimelineEvents,
  isShownAsActiveInvoice,
  mapBillingStatusToTimeline,
  mergeCanonicalAndIndexEvents,
  sortTimelineEvents,
  timelineKindMessageKey,
} from './domain/timeline';
export type {
  TimelineCategory,
  TimelineEvent,
  TimelineEventKind,
  TimelinePresentation,
  TimelineSortDirection,
} from './domain/timeline';

export {
  CLIENT_STATUSES,
  CONTACT_ROLES,
  IDENTIFIER_TYPES,
} from './domain/types';
export {
  pickPracticalClientContact,
  resolveProjectDisplayContact,
  contactBelongsToClient,
} from './domain/practical-contact';
export {
  buildClientArchivePatch,
  buildClientRestorePatch,
  isClientSoftArchived,
} from './domain/soft-archive';
export type {
  ClientStatus,
  ClientRecord,
  ClientListItem,
  ClientDetail,
  ClientContactRecord,
  PartyIdentifierRecord,
  IdentifierType,
} from './domain/types';

export {
  createClientSchema,
  updateClientSchema,
  archiveClientSchema,
  restoreClientSchema,
  createContactSchema,
  updateContactSchema,
  markContactPrimarySchema,
  upsertIdentifierSchema,
  recordActivityEventSchema,
} from './validation/schemas';
export type { RecordActivityEventInput } from './validation/schemas';
