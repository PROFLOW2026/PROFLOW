import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import type { ClientDetail, ClientListFilters, ClientListItem } from '../domain/types';
import { getClientDetail, listClients } from '../data/clients.repository';
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
