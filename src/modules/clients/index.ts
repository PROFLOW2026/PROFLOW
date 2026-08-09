/** Public API of the clients module. */
export { createClient } from './application/create-client';
export { updateClient } from './application/update-client';
export { archiveClient } from './application/archive-client';
export { listClientsForOrg, getClientById } from './application/list-clients';
export {
  createClientContact,
  updateClientContact,
  removeClientContact,
  upsertClientPartyIdentifier,
  removeClientPartyIdentifier,
} from './application/manage-contacts';

export {
  CLIENT_STATUSES,
  CONTACT_ROLES,
  IDENTIFIER_TYPES,
} from './domain/types';
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
