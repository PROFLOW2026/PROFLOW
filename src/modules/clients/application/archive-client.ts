import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { ClientRecord } from '../domain/types';
import { findClientById, updateClientById } from '../data/clients.repository';
import { archiveClientSchema } from '../validation/schemas';

export async function archiveClient(
  context: OrgContext,
  rawInput: { clientId: string },
): Promise<ClientRecord> {
  assertPermission(context, PERMISSIONS.CLIENTS_MANAGE);

  const parsed = archiveClientSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findClientById(context.db, context.organizationId, parsed.data.clientId);
  if (!existing) throw new NotFoundError('Client');
  assertSameOrganization(context, existing, 'Client');

  const updated = await updateClientById(context.db, context.organizationId, parsed.data.clientId, {
    status: 'inactive',
    archivedAt: new Date(),
  });

  if (!updated) throw new NotFoundError('Client');

  await recordAuditEvent(context, {
    action: 'client.archived',
    entityType: 'client',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
