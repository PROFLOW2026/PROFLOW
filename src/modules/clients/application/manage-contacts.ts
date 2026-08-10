import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import type { ClientContactRecord, PartyIdentifierRecord } from '../domain/types';
import {
  deleteClientContact,
  deleteClientIdentifier,
  findClientById,
  findClientContactById,
  findClientIdentifierById,
  insertClientContact,
  listClientContacts,
  updateClientContactById,
  upsertClientIdentifier,
} from '../data/clients.repository';
import {
  createContactSchema,
  deleteContactSchema,
  deleteIdentifierSchema,
  markContactPrimarySchema,
  updateContactSchema,
  upsertIdentifierSchema,
} from '../validation/schemas';

export async function createClientContact(
  context: OrgContext,
  rawInput: {
    clientId: string;
    name: string;
    role?: ClientContactRecord['role'];
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
): Promise<ClientContactRecord> {
  assertPermission(context, PERMISSIONS.CLIENTS_MANAGE);

  const parsed = createContactSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const client = await findClientById(context.db, context.organizationId, parsed.data.clientId);
  if (!client) throw new NotFoundError('Client');
  assertSameOrganization(context, client, 'Client');

  const contact = await insertClientContact(context.db, {
    organizationId: context.organizationId,
    clientId: parsed.data.clientId,
    name: parsed.data.name,
    role: parsed.data.role,
    email: parsed.data.email ?? null,
    phone: parsed.data.phone ?? null,
    notes: parsed.data.notes ?? null,
  });

  await recordAuditEvent(context, {
    action: 'client_contact.created',
    entityType: 'client_contact',
    entityId: contact.id,
    after: contact,
  });

  return contact;
}

export async function updateClientContact(
  context: OrgContext,
  rawInput: {
    contactId: string;
    name?: string;
    role?: ClientContactRecord['role'];
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
): Promise<ClientContactRecord> {
  assertPermission(context, PERMISSIONS.CLIENTS_MANAGE);

  const parsed = updateContactSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findClientContactById(
    context.db,
    context.organizationId,
    parsed.data.contactId,
  );
  if (!existing) throw new NotFoundError('Contact');

  const updated = await updateClientContactById(
    context.db,
    context.organizationId,
    parsed.data.contactId,
    {
      name: parsed.data.name,
      role: parsed.data.role,
      email: parsed.data.email,
      phone: parsed.data.phone,
      notes: parsed.data.notes,
    },
  );
  if (!updated) throw new NotFoundError('Contact');

  await recordAuditEvent(context, {
    action: 'client_contact.updated',
    entityType: 'client_contact',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

/**
 * Marks one contact as the client's practical primary; demotes other primary roles to other.
 * Project contact assignment uses projects.primary_contact_id and must NOT call this.
 */
export async function markClientContactAsPrimary(
  context: OrgContext,
  rawInput: { contactId: string },
): Promise<ClientContactRecord> {
  assertPermission(context, PERMISSIONS.CLIENTS_MANAGE);

  const parsed = markContactPrimarySchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findClientContactById(
    context.db,
    context.organizationId,
    parsed.data.contactId,
  );
  if (!existing) throw new NotFoundError('Contact');

  const siblings = await listClientContacts(
    context.db,
    context.organizationId,
    existing.clientId,
  );

  for (const sibling of siblings) {
    if (sibling.id === existing.id) continue;
    if (sibling.role !== 'primary') continue;
    await updateClientContactById(context.db, context.organizationId, sibling.id, {
      role: 'other',
    });
  }

  const updated =
    existing.role === 'primary'
      ? existing
      : await updateClientContactById(context.db, context.organizationId, existing.id, {
          role: 'primary',
        });
  if (!updated) throw new NotFoundError('Contact');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.CLIENT_CONTACT_MARKED_PRIMARY,
    entityType: 'client_contact',
    entityId: updated.id,
    before: existing,
    after: updated,
  });

  return updated;
}

export async function removeClientContact(
  context: OrgContext,
  rawInput: { contactId: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.CLIENTS_MANAGE);

  const parsed = deleteContactSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findClientContactById(
    context.db,
    context.organizationId,
    parsed.data.contactId,
  );
  if (!existing) throw new NotFoundError('Contact');

  await deleteClientContact(context.db, context.organizationId, parsed.data.contactId);

  await recordAuditEvent(context, {
    action: 'client_contact.deleted',
    entityType: 'client_contact',
    entityId: existing.id,
    before: existing,
  });
}

export async function upsertClientPartyIdentifier(
  context: OrgContext,
  rawInput: {
    clientId: string;
    type: PartyIdentifierRecord['type'];
    value: string;
  },
): Promise<PartyIdentifierRecord> {
  assertPermission(context, PERMISSIONS.CLIENTS_MANAGE);

  const parsed = upsertIdentifierSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const client = await findClientById(context.db, context.organizationId, parsed.data.clientId);
  if (!client) throw new NotFoundError('Client');
  assertSameOrganization(context, client, 'Client');

  const identifier = await upsertClientIdentifier(context.db, {
    organizationId: context.organizationId,
    clientId: parsed.data.clientId,
    type: parsed.data.type,
    value: parsed.data.value,
  });

  await recordAuditEvent(context, {
    action: 'party_identifier.upserted',
    entityType: 'party_identifier',
    entityId: identifier.id,
    after: identifier,
  });

  return identifier;
}

export async function removeClientPartyIdentifier(
  context: OrgContext,
  rawInput: { identifierId: string },
): Promise<void> {
  assertPermission(context, PERMISSIONS.CLIENTS_MANAGE);

  const parsed = deleteIdentifierSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findClientIdentifierById(
    context.db,
    context.organizationId,
    parsed.data.identifierId,
  );
  if (!existing) throw new NotFoundError('Identifier');

  await deleteClientIdentifier(context.db, context.organizationId, parsed.data.identifierId);

  await recordAuditEvent(context, {
    action: 'party_identifier.deleted',
    entityType: 'party_identifier',
    entityId: existing.id,
    before: existing,
  });
}
