import { getClientContactById, contactBelongsToClient } from '@/modules/clients';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
/**
 * Ensures primaryContactId is null, or belongs to the project's client in-org.
 * Does not mutate client-wide primary role.
 */
export async function resolvePrimaryContactIdForProject(
  context: OrgContext,
  clientId: string | null,
  primaryContactId: string | null | undefined,
): Promise<string | null> {
  if (primaryContactId == null) return null;

  if (!clientId) {
    throw new ValidationError([
      { path: 'primaryContactId', message: 'Project contact requires a client' },
    ]);
  }

  const contact = await getClientContactById(context, primaryContactId);
  if (!contact) throw new NotFoundError('Contact');

  if (!contactBelongsToClient(contact, clientId)) {
    throw new ValidationError([
      {
        path: 'primaryContactId',
        message: 'Project contact must belong to the project client',
      },
    ]);
  }

  return contact.id;
}
