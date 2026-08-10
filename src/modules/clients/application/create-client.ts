import { recordAuditEvent } from '@/shared/audit';
import { ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import { noteModuleUsage } from '@/modules/tenancy';
import type { ClientRecord } from '../domain/types';
import { insertClient, insertClientContact } from '../data/clients.repository';
import { createClientSchema, type CreateClientInput } from '../validation/schemas';

export async function createClient(
  context: OrgContext,
  rawInput: CreateClientInput,
): Promise<ClientRecord> {
  assertPermission(context, PERMISSIONS.CLIENTS_MANAGE);

  const parsed = createClientSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;

  const client = await insertClient(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    legalName: input.legalName ?? null,
    email: input.email ?? null,
    phone: input.phone ?? null,
    website: input.website ?? null,
    addressLine1: input.addressLine1 ?? null,
    addressLine2: input.addressLine2 ?? null,
    city: input.city ?? null,
    region: input.region ?? null,
    postalCode: input.postalCode ?? null,
    countryCode: input.countryCode ?? null,
    notes: input.notes ?? null,
  });

  if (input.primaryContactName && input.primaryContactPhone) {
    const contact = await insertClientContact(context.db, {
      organizationId: context.organizationId,
      clientId: client.id,
      name: input.primaryContactName,
      role: input.primaryContactRole ?? 'primary',
      email: input.primaryContactEmail ?? null,
      phone: input.primaryContactPhone,
    });

    await recordAuditEvent(context, {
      action: 'client_contact.created',
      entityType: 'client_contact',
      entityId: contact.id,
      after: contact,
    });
  }

  await noteModuleUsage(context.db, context.organizationId, 'clients');

  await recordAuditEvent(context, {
    action: 'client.created',
    entityType: 'client',
    entityId: client.id,
    after: client,
  });

  return client;
}
