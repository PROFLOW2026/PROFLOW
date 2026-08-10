/** Public API of the clients module. */
export { createClient } from './application/create-client';
export { updateClient } from './application/update-client';
export { archiveClient } from './application/archive-client';
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
  createContactSchema,
  upsertIdentifierSchema,
} from './validation/schemas';
