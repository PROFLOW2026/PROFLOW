import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { clientContacts, clients, partyIdentifiers, projects } from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ClientContactRecord,
  ClientDetail,
  ClientListFilters,
  ClientListItem,
  ClientRecord,
  PartyIdentifierRecord,
} from '../domain/types';

function mapClient(row: typeof clients.$inferSelect): ClientRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status,
    legalName: row.legalName,
    email: row.email,
    phone: row.phone,
    website: row.website,
    addressLine1: row.addressLine1,
    addressLine2: row.addressLine2,
    city: row.city,
    region: row.region,
    postalCode: row.postalCode,
    countryCode: row.countryCode,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapContact(row: typeof clientContacts.$inferSelect): ClientContactRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapIdentifier(row: typeof partyIdentifiers.$inferSelect): PartyIdentifierRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    vendorId: row.vendorId,
    type: row.type,
    value: row.value,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertClient(
  db: DbExecutor,
  input: {
    organizationId: string;
    name: string;
    status?: ClientRecord['status'];
    legalName?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    addressLine1?: string | null;
    addressLine2?: string | null;
    city?: string | null;
    region?: string | null;
    postalCode?: string | null;
    countryCode?: string | null;
    notes?: string | null;
  },
): Promise<ClientRecord> {
  const [row] = await db
    .insert(clients)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      status: input.status ?? 'active',
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
    })
    .returning();

  return mapClient(row!);
}

export async function updateClientById(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
  patch: Partial<{
    name: string;
    status: ClientRecord['status'];
    legalName: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    addressLine1: string | null;
    addressLine2: string | null;
    city: string | null;
    region: string | null;
    postalCode: string | null;
    countryCode: string | null;
    notes: string | null;
    archivedAt: Date | null;
  }>,
): Promise<ClientRecord | null> {
  const [row] = await db
    .update(clients)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)))
    .returning();

  return row ? mapClient(row) : null;
}

export async function findClientById(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
): Promise<ClientRecord | null> {
  const [row] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, clientId), eq(clients.organizationId, organizationId)))
    .limit(1);

  return row ? mapClient(row) : null;
}

export async function listClients(
  db: DbExecutor,
  organizationId: string,
  filters: ClientListFilters = {},
): Promise<ClientListItem[]> {
  const conditions = [eq(clients.organizationId, organizationId)];

  if (!filters.includeArchived) {
    conditions.push(isNull(clients.archivedAt));
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(clients.status, filters.status));
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(clients.name, term), ilike(clients.legalName, term))!);
  }

  const hardCap =
    filters.limit != null && filters.limit > ORG_LIST_HARD_CAP
      ? ORG_LIST_EXPORT_CAP
      : ORG_LIST_HARD_CAP;
  const limit = resolveListLimit(filters.limit, { hardCap });
  const offset = resolveListOffset(filters.offset);

  const rows = await db
    .select({
      client: clients,
      projectCount: sql<number>`(
        select count(*)::int from projects p
        where p.client_id = ${clients.id}
          and p.organization_id = ${organizationId}
          and p.archived_at is null
      )`,
    })
    .from(clients)
    .where(and(...conditions))
    .orderBy(clients.name)
    .limit(limit)
    .offset(offset);

  return rows.map((row) => ({
    ...mapClient(row.client),
    projectCount: row.projectCount,
  }));
}

export async function getClientDetail(
  db: DbExecutor,
  organizationId: string,
  clientId: string,
): Promise<ClientDetail | null> {
  const client = await findClientById(db, organizationId, clientId);
  if (!client) return null;

  const contacts = await db
    .select()
    .from(clientContacts)
    .where(
      and(eq(clientContacts.organizationId, organizationId), eq(clientContacts.clientId, clientId)),
    )
    .orderBy(clientContacts.name);

  const identifiers = await db
    .select()
    .from(partyIdentifiers)
    .where(
      and(
        eq(partyIdentifiers.organizationId, organizationId),
        eq(partyIdentifiers.clientId, clientId),
      ),
    );

  const [countRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projects)
    .where(
      and(
        eq(projects.organizationId, organizationId),
        eq(projects.clientId, clientId),
        isNull(projects.archivedAt),
      ),
    );

  return {
    ...client,
    contacts: contacts.map(mapContact),
    identifiers: identifiers.map(mapIdentifier),
    projectCount: countRow?.count ?? 0,
  };
}

export async function insertClientContact(
  db: DbExecutor,
  input: {
    organizationId: string;
    clientId: string;
    name: string;
    role?: ClientContactRecord['role'];
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
): Promise<ClientContactRecord> {
  const [row] = await db
    .insert(clientContacts)
    .values({
      organizationId: input.organizationId,
      clientId: input.clientId,
      name: input.name,
      role: input.role ?? 'primary',
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapContact(row!);
}

export async function updateClientContactById(
  db: DbExecutor,
  organizationId: string,
  contactId: string,
  patch: Partial<{
    name: string;
    role: ClientContactRecord['role'];
    email: string | null;
    phone: string | null;
    notes: string | null;
  }>,
): Promise<ClientContactRecord | null> {
  const [row] = await db
    .update(clientContacts)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(clientContacts.id, contactId), eq(clientContacts.organizationId, organizationId)),
    )
    .returning();

  return row ? mapContact(row) : null;
}

export async function deleteClientContact(
  db: DbExecutor,
  organizationId: string,
  contactId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(clientContacts)
    .where(
      and(eq(clientContacts.id, contactId), eq(clientContacts.organizationId, organizationId)),
    )
    .returning({ id: clientContacts.id });

  return deleted.length > 0;
}

export async function findClientContactById(
  db: DbExecutor,
  organizationId: string,
  contactId: string,
): Promise<ClientContactRecord | null> {
  const [row] = await db
    .select()
    .from(clientContacts)
    .where(
      and(eq(clientContacts.id, contactId), eq(clientContacts.organizationId, organizationId)),
    )
    .limit(1);

  return row ? mapContact(row) : null;
}

export async function upsertClientIdentifier(
  db: DbExecutor,
  input: {
    organizationId: string;
    clientId: string;
    type: PartyIdentifierRecord['type'];
    value: string;
  },
): Promise<PartyIdentifierRecord> {
  const existing = await db
    .select()
    .from(partyIdentifiers)
    .where(
      and(
        eq(partyIdentifiers.organizationId, input.organizationId),
        eq(partyIdentifiers.clientId, input.clientId),
        eq(partyIdentifiers.type, input.type),
      ),
    )
    .limit(1);

  if (existing[0]) {
    const [row] = await db
      .update(partyIdentifiers)
      .set({ value: input.value, updatedAt: new Date() })
      .where(eq(partyIdentifiers.id, existing[0].id))
      .returning();
    return mapIdentifier(row!);
  }

  const [row] = await db
    .insert(partyIdentifiers)
    .values({
      organizationId: input.organizationId,
      clientId: input.clientId,
      type: input.type,
      value: input.value,
    })
    .returning();

  return mapIdentifier(row!);
}

export async function deleteClientIdentifier(
  db: DbExecutor,
  organizationId: string,
  identifierId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(partyIdentifiers)
    .where(
      and(
        eq(partyIdentifiers.id, identifierId),
        eq(partyIdentifiers.organizationId, organizationId),
      ),
    )
    .returning({ id: partyIdentifiers.id });

  return deleted.length > 0;
}

export async function findClientIdentifierById(
  db: DbExecutor,
  organizationId: string,
  identifierId: string,
): Promise<PartyIdentifierRecord | null> {
  const [row] = await db
    .select()
    .from(partyIdentifiers)
    .where(
      and(
        eq(partyIdentifiers.id, identifierId),
        eq(partyIdentifiers.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row ? mapIdentifier(row) : null;
}
