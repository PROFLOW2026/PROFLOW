import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type {
  ClientContactRecord,
  ClientDetail,
  ClientListFilters,
  ClientListItem,
} from '../domain/types';
import { pickPracticalClientContact } from '../domain/practical-contact';
import {
  findClientContactById,
  getClientDetail,
  listClientContacts,
  listClientContactsForClients,
  listClients,
} from '../data/clients.repository';
import { listClientsSchema } from '../validation/schemas';

export async function listClientsForOrg(
  context: OrgContext,
  rawFilters: ClientListFilters = {},
): Promise<ClientListItem[]> {
  assertPermission(context, PERMISSIONS.CLIENTS_READ);

  const parsed = listClientsSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  return listClients(context.db, context.organizationId, parsed.data);
}

export async function getClientById(
  context: OrgContext,
  clientId: string,
): Promise<ClientDetail> {
  assertPermission(context, PERMISSIONS.CLIENTS_READ);

  const detail = await getClientDetail(context.db, context.organizationId, clientId);
  if (!detail) throw new NotFoundError('Client');

  return detail;
}

export async function listContactsForClient(
  context: OrgContext,
  clientId: string,
): Promise<ClientContactRecord[]> {
  assertPermission(context, PERMISSIONS.CLIENTS_READ);
  return listClientContacts(context.db, context.organizationId, clientId);
}

export async function listContactsForClients(
  context: OrgContext,
  clientIds: readonly string[],
): Promise<ClientContactRecord[]> {
  assertPermission(context, PERMISSIONS.CLIENTS_READ);
  return listClientContactsForClients(context.db, context.organizationId, clientIds);
}

export async function getPracticalContactForClient(
  context: OrgContext,
  clientId: string,
): Promise<ClientContactRecord | null> {
  assertPermission(context, PERMISSIONS.CLIENTS_READ);
  const contacts = await listClientContacts(context.db, context.organizationId, clientId);
  return pickPracticalClientContact(contacts);
}

export async function getClientContactById(
  context: OrgContext,
  contactId: string,
): Promise<ClientContactRecord | null> {
  assertPermission(context, PERMISSIONS.CLIENTS_READ);
  return findClientContactById(context.db, context.organizationId, contactId);
}

/**
 * Contact for project chrome / headers. Caller must already have PROJECTS_READ
 * (or equivalent). Does not require CLIENTS_READ - workers open projects without
 * Clients module access.
 */
export async function loadDisplayContactForProject(
  context: OrgContext,
  input: { clientId: string; primaryContactId: string | null },
): Promise<ClientContactRecord | null> {
  const projectContact = input.primaryContactId
    ? await findClientContactById(context.db, context.organizationId, input.primaryContactId)
    : null;

  if (projectContact && projectContact.clientId === input.clientId) {
    return projectContact;
  }

  const contacts = await listClientContacts(context.db, context.organizationId, input.clientId);
  return pickPracticalClientContact(contacts);
}
