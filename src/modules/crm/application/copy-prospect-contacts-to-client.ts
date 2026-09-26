import { and, eq } from 'drizzle-orm';
import { clientContacts, clients } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import type { ContactRole } from '@/modules/clients/domain/types';
import { listProspectContacts } from '../data/crm.repository';
import { selectProspectContactsToCopy } from '../domain/prospect-contact-copy';

/**
 * Copies crm_prospect_contacts onto an existing client.
 * Does not insert a client row. Skips a contact that already has the same email or phone.
 */
export async function copyProspectContactsOntoClient(
  context: OrgContext,
  input: { readonly prospectId: string; readonly clientId: string },
): Promise<void> {
  const clientId = input.clientId.trim();
  const prospectId = input.prospectId.trim();
  if (!clientId || !prospectId) return;

  const [client] = await context.db
    .select({ id: clients.id })
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, context.organizationId)))
    .limit(1);
  if (!client) return;

  const prospectContacts = await listProspectContacts(
    context.db,
    context.organizationId,
    prospectId,
  );
  if (prospectContacts.length === 0) return;

  const existing = await context.db
    .select({
      name: clientContacts.name,
      email: clientContacts.email,
      phone: clientContacts.phone,
      role: clientContacts.role,
    })
    .from(clientContacts)
    .where(
      and(
        eq(clientContacts.organizationId, context.organizationId),
        eq(clientContacts.clientId, clientId),
      ),
    );

  const missing = selectProspectContactsToCopy(prospectContacts, existing);
  let hasPrimary = existing.some((row) => row.role === 'primary');

  for (const contact of missing) {
    const role: ContactRole = hasPrimary ? 'other' : 'primary';
    if (role === 'primary') hasPrimary = true;

    const [row] = await context.db
      .insert(clientContacts)
      .values({
        organizationId: context.organizationId,
        clientId,
        name: contact.name,
        role,
        email: contact.email,
        phone: contact.phone,
      })
      .returning();
    if (!row) continue;

    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.CLIENT_CONTACT_CREATED,
      entityType: 'client_contact',
      entityId: row.id,
      after: {
        id: row.id,
        clientId,
        name: row.name,
        email: row.email,
        phone: row.phone,
        role: row.role,
      },
    });
  }
}
