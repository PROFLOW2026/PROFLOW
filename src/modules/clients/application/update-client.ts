import { recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { ClientRecord } from '../domain/types';
import { findClientById, updateClientById } from '../data/clients.repository';
import { updateClientSchema, type UpdateClientInput } from '../validation/schemas';

export async function updateClient(
  context: OrgContext,
  rawInput: UpdateClientInput,
): Promise<ClientRecord> {
  assertPermission(context, PERMISSIONS.CLIENTS_MANAGE);

  const parsed = updateClientSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findClientById(context.db, context.organizationId, parsed.data.clientId);
  if (!existing) throw new NotFoundError('Client');
  assertSameOrganization(context, existing, 'Client');

  const updated = await updateClientById(context.db, context.organizationId, parsed.data.clientId, {
    name: parsed.data.name,
    status: parsed.data.status,
    legalName: parsed.data.legalName,
    email: parsed.data.email,
    phone: parsed.data.phone,
    website: parsed.data.website,
    addressLine1: parsed.data.addressLine1,
    addressLine2: parsed.data.addressLine2,
    city: parsed.data.city,
    region: parsed.data.region,
    postalCode: parsed.data.postalCode,
    countryCode: parsed.data.countryCode,
    notes: parsed.data.notes,
    clientTypeId: parsed.data.clientTypeId,
    defaultPaymentTermId: parsed.data.defaultPaymentTermId,
  });

  if (!updated) throw new NotFoundError('Client');

  await recordAuditEvent(context, {
    action: 'client.updated',
    entityType: 'client',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}
