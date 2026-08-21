import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import {
  expenses,
  organizationCatalogEntries,
  partyIdentifiers,
  projects,
  vendorCatalogLinks,
  vendorContacts,
  vendorEngagements,
  vendors,
} from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import { normalizeVendorName } from '../domain/name-matching';
import type {
  EngagementStatus,
  ProjectVendorEngagementSummary,
  VendorCatalogLinkKind,
  VendorCatalogLinkRecord,
  VendorContactRecord,
  VendorDetail,
  VendorEngagementRecord,
  VendorEngagementSummary,
  VendorIdentifierRecord,
  VendorIdentifierType,
  VendorListFilters,
  VendorListItem,
  VendorRecord,
} from '../domain/types';

function mapVendor(row: typeof vendors.$inferSelect): VendorRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    type: row.type,
    status: row.status,
    tier: row.tier,
    parentVendorId: row.parentVendorId,
    email: row.email,
    phone: row.phone,
    website: row.website,
    addressLine1: row.addressLine1,
    city: row.city,
    countryCode: row.countryCode,
    notes: row.notes,
    defaultPaymentTermId: row.defaultPaymentTermId ?? null,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapContact(row: typeof vendorContacts.$inferSelect): VendorContactRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId,
    name: row.name,
    role: row.role,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEngagement(row: typeof vendorEngagements.$inferSelect): VendorEngagementRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId,
    projectId: row.projectId,
    role: row.role,
    notes: row.notes,
    startDate: row.startDate,
    endDate: row.endDate,
    status: row.status as EngagementStatus,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertVendor(
  db: DbExecutor,
  input: {
    id?: string;
    organizationId: string;
    name: string;
    type?: VendorRecord['type'];
    status?: VendorRecord['status'];
    tier?: string | null;
    parentVendorId?: string | null;
    email?: string | null;
    phone?: string | null;
    website?: string | null;
    addressLine1?: string | null;
    city?: string | null;
    countryCode?: string | null;
    notes?: string | null;
    defaultPaymentTermId?: string | null;
  },
): Promise<VendorRecord> {
  const [row] = await db
    .insert(vendors)
    .values({
      ...(input.id ? { id: input.id } : {}),
      organizationId: input.organizationId,
      name: input.name,
      type: input.type ?? 'supplier',
      status: input.status ?? 'active',
      tier: input.tier ?? null,
      parentVendorId: input.parentVendorId ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      addressLine1: input.addressLine1 ?? null,
      city: input.city ?? null,
      countryCode: input.countryCode ?? null,
      notes: input.notes ?? null,
      defaultPaymentTermId: input.defaultPaymentTermId ?? null,
    })
    .returning();

  return mapVendor(row!);
}

export async function updateVendorById(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
  patch: Partial<{
    name: string;
    type: VendorRecord['type'];
    status: VendorRecord['status'];
    tier: string | null;
    parentVendorId: string | null;
    email: string | null;
    phone: string | null;
    website: string | null;
    addressLine1: string | null;
    city: string | null;
    countryCode: string | null;
    notes: string | null;
    defaultPaymentTermId: string | null;
    archivedAt: Date | null;
  }>,
): Promise<VendorRecord | null> {
  const [row] = await db
    .update(vendors)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId)))
    .returning();

  return row ? mapVendor(row) : null;
}

export async function findVendorById(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<VendorRecord | null> {
  const [row] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, organizationId)))
    .limit(1);

  return row ? mapVendor(row) : null;
}

export async function findVendorByNormalizedName(
  db: DbExecutor,
  organizationId: string,
  name: string,
): Promise<VendorRecord | null> {
  const normalized = normalizeVendorName(name);
  const rows = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.organizationId, organizationId), isNull(vendors.archivedAt)));

  const match = rows.find((row) => normalizeVendorName(row.name) === normalized);
  return match ? mapVendor(match) : null;
}

export async function listVendors(
  db: DbExecutor,
  organizationId: string,
  filters: VendorListFilters = {},
): Promise<VendorListItem[]> {
  const conditions = [eq(vendors.organizationId, organizationId)];

  if (!filters.includeArchived) {
    conditions.push(isNull(vendors.archivedAt));
  }

  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(vendors.status, filters.status));
  }

  if (filters.type && filters.type !== 'all') {
    conditions.push(eq(vendors.type, filters.type));
  }

  if (filters.categoryId) {
    conditions.push(
      sql`exists (
        select 1 from vendor_catalog_links vcl
        where vcl.vendor_id = vendors.id
          and vcl.organization_id = ${organizationId}
          and vcl.catalog_entry_id = ${filters.categoryId}
          and vcl.link_kind = 'vendor_category'
      )`,
    );
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(vendors.name, term), ilike(vendors.notes, term))!);
  }

  const rows = await db
    .select({
      vendor: vendors,
      engagementCount: sql<number>`(
        select count(*)::int from vendor_engagements ve
        where ve.vendor_id = vendors.id
          and ve.organization_id = ${organizationId}
          and ve.archived_at is null
          and ve.status = 'active'
      )`,
      projectCount: sql<number>`(
        select count(distinct ve.project_id)::int from vendor_engagements ve
        where ve.vendor_id = vendors.id
          and ve.organization_id = ${organizationId}
          and ve.archived_at is null
          and ve.status = 'active'
      )`,
      categoryNames: sql<string>`(
        select coalesce(string_agg(oce.name, '|' order by oce.sort_order, oce.name), '')
        from vendor_catalog_links vcl
        inner join organization_catalog_entries oce
          on oce.id = vcl.catalog_entry_id
         and oce.organization_id = vcl.organization_id
        where vcl.vendor_id = vendors.id
          and vcl.organization_id = ${organizationId}
          and vcl.link_kind = 'vendor_category'
      )`,
    })
    .from(vendors)
    .where(and(...conditions))
    .orderBy(vendors.name)
    .limit(
      resolveListLimit(filters.limit, {
        hardCap:
          filters.limit != null && filters.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(filters.offset));

  return rows.map((row) => ({
    ...mapVendor(row.vendor),
    engagementCount: row.engagementCount,
    projectCount: row.projectCount,
    categoryNames: row.categoryNames
      ? row.categoryNames.split('|').filter((name) => name.length > 0)
      : [],
  }));
}

export async function getVendorDetail(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<VendorDetail | null> {
  const vendor = await findVendorById(db, organizationId, vendorId);
  if (!vendor) return null;

  const contacts = await db
    .select()
    .from(vendorContacts)
    .where(
      and(eq(vendorContacts.organizationId, organizationId), eq(vendorContacts.vendorId, vendorId)),
    )
    .orderBy(vendorContacts.name);

  const engagementRows = await db
    .select({ engagement: vendorEngagements, projectName: projects.name })
    .from(vendorEngagements)
    .innerJoin(projects, eq(vendorEngagements.projectId, projects.id))
    .where(
      and(
        eq(vendorEngagements.organizationId, organizationId),
        eq(vendorEngagements.vendorId, vendorId),
        isNull(vendorEngagements.archivedAt),
      ),
    )
    .orderBy(vendorEngagements.status, projects.name, vendorEngagements.startDate);

  let parentVendorName: string | null = null;
  if (vendor.parentVendorId) {
    const parent = await findVendorById(db, organizationId, vendor.parentVendorId);
    parentVendorName = parent?.name ?? null;
  }

  let defaultPaymentTermName: string | null = null;
  if (vendor.defaultPaymentTermId) {
    const [termRow] = await db
      .select({ name: organizationCatalogEntries.name })
      .from(organizationCatalogEntries)
      .where(
        and(
          eq(organizationCatalogEntries.id, vendor.defaultPaymentTermId),
          eq(organizationCatalogEntries.organizationId, organizationId),
        ),
      )
      .limit(1);
    defaultPaymentTermName = termRow?.name ?? null;
  }

  const [identifiers, catalogLinks] = await Promise.all([
    listVendorIdentifiers(db, organizationId, vendorId),
    listVendorCatalogLinks(db, organizationId, vendorId),
  ]);

  const engagements: VendorEngagementSummary[] = engagementRows.map((row) => ({
    ...mapEngagement(row.engagement),
    projectName: row.projectName,
  }));

  const activeProjectIds = engagements
    .filter((engagement) => engagement.status === 'active')
    .map((engagement) => engagement.projectId);

  return {
    ...vendor,
    contacts: contacts.map(mapContact),
    engagements,
    identifiers,
    catalogLinks,
    parentVendorName,
    defaultPaymentTermName,
    projectCount: new Set(activeProjectIds).size,
  };
}

export async function listVendorIdentifiers(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<VendorIdentifierRecord[]> {
  const rows = await db
    .select()
    .from(partyIdentifiers)
    .where(
      and(
        eq(partyIdentifiers.organizationId, organizationId),
        eq(partyIdentifiers.vendorId, vendorId),
      ),
    )
    .orderBy(partyIdentifiers.type);

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId!,
    type: row.type as VendorIdentifierType,
    value: row.value,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }));
}

export async function upsertVendorIdentifier(
  db: DbExecutor,
  input: {
    organizationId: string;
    vendorId: string;
    type: VendorIdentifierType;
    value: string;
  },
): Promise<VendorIdentifierRecord> {
  const existing = await db
    .select()
    .from(partyIdentifiers)
    .where(
      and(
        eq(partyIdentifiers.organizationId, input.organizationId),
        eq(partyIdentifiers.vendorId, input.vendorId),
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
    return {
      id: row!.id,
      organizationId: row!.organizationId,
      vendorId: row!.vendorId!,
      type: row!.type as VendorIdentifierType,
      value: row!.value,
      createdAt: row!.createdAt,
      updatedAt: row!.updatedAt,
    };
  }

  const [row] = await db
    .insert(partyIdentifiers)
    .values({
      organizationId: input.organizationId,
      vendorId: input.vendorId,
      type: input.type,
      value: input.value,
    })
    .returning();

  return {
    id: row!.id,
    organizationId: row!.organizationId,
    vendorId: row!.vendorId!,
    type: row!.type as VendorIdentifierType,
    value: row!.value,
    createdAt: row!.createdAt,
    updatedAt: row!.updatedAt,
  };
}

export async function deleteVendorIdentifier(
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

export async function findVendorIdentifierById(
  db: DbExecutor,
  organizationId: string,
  identifierId: string,
): Promise<VendorIdentifierRecord | null> {
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

  if (!row || !row.vendorId) return null;
  return {
    id: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId,
    type: row.type as VendorIdentifierType,
    value: row.value,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listVendorCatalogLinks(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
): Promise<VendorCatalogLinkRecord[]> {
  const rows = await db
    .select({
      link: vendorCatalogLinks,
      entryName: organizationCatalogEntries.name,
      entryKey: organizationCatalogEntries.key,
    })
    .from(vendorCatalogLinks)
    .innerJoin(
      organizationCatalogEntries,
      and(
        eq(organizationCatalogEntries.id, vendorCatalogLinks.catalogEntryId),
        eq(organizationCatalogEntries.organizationId, vendorCatalogLinks.organizationId),
      ),
    )
    .where(
      and(
        eq(vendorCatalogLinks.organizationId, organizationId),
        eq(vendorCatalogLinks.vendorId, vendorId),
      ),
    )
    .orderBy(organizationCatalogEntries.sortOrder, organizationCatalogEntries.name);

  return rows.map((row) => ({
    id: row.link.id,
    organizationId: row.link.organizationId,
    vendorId: row.link.vendorId,
    catalogEntryId: row.link.catalogEntryId,
    linkKind: row.link.linkKind as VendorCatalogLinkKind,
    entryName: row.entryName,
    entryKey: row.entryKey,
  }));
}

/**
 * Replace category/specialty links for a vendor. Pass only the entry ids that
 * should remain; missing kinds clear that kind.
 */
export async function replaceVendorCatalogLinks(
  db: DbExecutor,
  input: {
    organizationId: string;
    vendorId: string;
    categoryIds: readonly string[];
    specialtyIds: readonly string[];
  },
): Promise<VendorCatalogLinkRecord[]> {
  await db
    .delete(vendorCatalogLinks)
    .where(
      and(
        eq(vendorCatalogLinks.organizationId, input.organizationId),
        eq(vendorCatalogLinks.vendorId, input.vendorId),
      ),
    );

  const rows: Array<{
    organizationId: string;
    vendorId: string;
    catalogEntryId: string;
    linkKind: VendorCatalogLinkKind;
  }> = [
    ...input.categoryIds.map((catalogEntryId) => ({
      organizationId: input.organizationId,
      vendorId: input.vendorId,
      catalogEntryId,
      linkKind: 'vendor_category' as const,
    })),
    ...input.specialtyIds.map((catalogEntryId) => ({
      organizationId: input.organizationId,
      vendorId: input.vendorId,
      catalogEntryId,
      linkKind: 'vendor_specialty' as const,
    })),
  ];

  if (rows.length > 0) {
    await db.insert(vendorCatalogLinks).values(rows);
  }

  return listVendorCatalogLinks(db, input.organizationId, input.vendorId);
}

export async function insertVendorContact(
  db: DbExecutor,
  input: {
    organizationId: string;
    vendorId: string;
    name: string;
    role?: VendorContactRecord['role'];
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
  },
): Promise<VendorContactRecord> {
  const [row] = await db
    .insert(vendorContacts)
    .values({
      organizationId: input.organizationId,
      vendorId: input.vendorId,
      name: input.name,
      role: input.role ?? 'primary',
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapContact(row!);
}

export async function updateVendorContactById(
  db: DbExecutor,
  organizationId: string,
  contactId: string,
  patch: Partial<{
    name: string;
    role: VendorContactRecord['role'];
    email: string | null;
    phone: string | null;
    notes: string | null;
  }>,
): Promise<VendorContactRecord | null> {
  const [row] = await db
    .update(vendorContacts)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(vendorContacts.id, contactId), eq(vendorContacts.organizationId, organizationId)),
    )
    .returning();

  return row ? mapContact(row) : null;
}

export async function deleteVendorContact(
  db: DbExecutor,
  organizationId: string,
  contactId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(vendorContacts)
    .where(
      and(eq(vendorContacts.id, contactId), eq(vendorContacts.organizationId, organizationId)),
    )
    .returning({ id: vendorContacts.id });

  return deleted.length > 0;
}

export async function findVendorContactById(
  db: DbExecutor,
  organizationId: string,
  contactId: string,
): Promise<VendorContactRecord | null> {
  const [row] = await db
    .select()
    .from(vendorContacts)
    .where(
      and(eq(vendorContacts.id, contactId), eq(vendorContacts.organizationId, organizationId)),
    )
    .limit(1);

  return row ? mapContact(row) : null;
}

export async function insertVendorEngagement(
  db: DbExecutor,
  input: {
    organizationId: string;
    vendorId: string;
    projectId: string;
    role?: string | null;
    notes?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    status?: EngagementStatus;
  },
): Promise<VendorEngagementRecord> {
  const [row] = await db
    .insert(vendorEngagements)
    .values({
      organizationId: input.organizationId,
      vendorId: input.vendorId,
      projectId: input.projectId,
      role: input.role ?? null,
      notes: input.notes ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: input.status ?? 'active',
    })
    .returning();

  return mapEngagement(row!);
}

export async function updateVendorEngagementById(
  db: DbExecutor,
  organizationId: string,
  engagementId: string,
  patch: Partial<{
    role: string | null;
    notes: string | null;
    startDate: string | null;
    endDate: string | null;
    status: EngagementStatus;
    archivedAt: Date | null;
  }>,
): Promise<VendorEngagementRecord | null> {
  const [row] = await db
    .update(vendorEngagements)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(vendorEngagements.id, engagementId),
        eq(vendorEngagements.organizationId, organizationId),
      ),
    )
    .returning();

  return row ? mapEngagement(row) : null;
}

export async function archiveVendorEngagementById(
  db: DbExecutor,
  organizationId: string,
  engagementId: string,
): Promise<VendorEngagementRecord | null> {
  return updateVendorEngagementById(db, organizationId, engagementId, {
    archivedAt: new Date(),
  });
}

export async function findVendorEngagementById(
  db: DbExecutor,
  organizationId: string,
  engagementId: string,
): Promise<VendorEngagementRecord | null> {
  const [row] = await db
    .select()
    .from(vendorEngagements)
    .where(
      and(
        eq(vendorEngagements.id, engagementId),
        eq(vendorEngagements.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row ? mapEngagement(row) : null;
}

export async function findActiveEngagementForVendorProject(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
  projectId: string,
): Promise<VendorEngagementRecord | null> {
  const [row] = await db
    .select()
    .from(vendorEngagements)
    .where(
      and(
        eq(vendorEngagements.organizationId, organizationId),
        eq(vendorEngagements.vendorId, vendorId),
        eq(vendorEngagements.projectId, projectId),
        eq(vendorEngagements.status, 'active'),
        isNull(vendorEngagements.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapEngagement(row) : null;
}

/**
 * List engagements for a vendor. Overlapping / multi-project spans are allowed.
 * Does not join expenses or labor - engagement is not Actual.
 */
export async function listEngagementsForVendor(
  db: DbExecutor,
  organizationId: string,
  vendorId: string,
  options: { status?: EngagementStatus | 'history' | 'all' } = {},
): Promise<VendorEngagementSummary[]> {
  const conditions = [
    eq(vendorEngagements.organizationId, organizationId),
    eq(vendorEngagements.vendorId, vendorId),
    isNull(vendorEngagements.archivedAt),
  ];

  if (options.status === 'history') {
    conditions.push(
      or(eq(vendorEngagements.status, 'ended'), eq(vendorEngagements.status, 'cancelled'))!,
    );
  } else if (options.status && options.status !== 'all') {
    conditions.push(eq(vendorEngagements.status, options.status));
  }

  const rows = await db
    .select({ engagement: vendorEngagements, projectName: projects.name })
    .from(vendorEngagements)
    .innerJoin(projects, eq(vendorEngagements.projectId, projects.id))
    .where(and(...conditions))
    .orderBy(vendorEngagements.status, projects.name, vendorEngagements.startDate);

  return rows.map((row) => ({
    ...mapEngagement(row.engagement),
    projectName: row.projectName,
  }));
}

/**
 * List engagements for a project (contractors panel). Engagement ≠ cost.
 */
export async function listEngagementsForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  options: { status?: EngagementStatus | 'history' | 'all' } = {},
): Promise<ProjectVendorEngagementSummary[]> {
  const conditions = [
    eq(vendorEngagements.organizationId, organizationId),
    eq(vendorEngagements.projectId, projectId),
    isNull(vendorEngagements.archivedAt),
  ];

  if (options.status === 'history') {
    conditions.push(
      or(eq(vendorEngagements.status, 'ended'), eq(vendorEngagements.status, 'cancelled'))!,
    );
  } else if (options.status && options.status !== 'all') {
    conditions.push(eq(vendorEngagements.status, options.status));
  }

  const rows = await db
    .select({
      engagement: vendorEngagements,
      vendorName: vendors.name,
      vendorType: vendors.type,
    })
    .from(vendorEngagements)
    .innerJoin(vendors, eq(vendorEngagements.vendorId, vendors.id))
    .where(and(...conditions))
    .orderBy(vendorEngagements.status, vendors.name, vendorEngagements.startDate);

  return rows.map((row) => ({
    ...mapEngagement(row.engagement),
    vendorName: row.vendorName,
    vendorType: row.vendorType,
  }));
}

/** Links an expense to a vendor while preserving the original supplier name. */
export async function linkExpenseToVendor(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
  vendorId: string,
): Promise<boolean> {
  const updated = await db
    .update(expenses)
    .set({ vendorId, updatedAt: new Date() })
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, organizationId)))
    .returning({ id: expenses.id });

  return updated.length > 0;
}

export async function findProjectById(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<{ id: string; organizationId: string; name: string } | null> {
  const [row] = await db
    .select({ id: projects.id, organizationId: projects.organizationId, name: projects.name })
    .from(projects)
    .where(and(eq(projects.id, projectId), eq(projects.organizationId, organizationId)))
    .limit(1);

  return row ?? null;
}

export async function findExpenseById(
  db: DbExecutor,
  organizationId: string,
  expenseId: string,
): Promise<{ id: string; organizationId: string; supplierName: string | null } | null> {
  const [row] = await db
    .select({
      id: expenses.id,
      organizationId: expenses.organizationId,
      supplierName: expenses.supplierName,
    })
    .from(expenses)
    .where(and(eq(expenses.id, expenseId), eq(expenses.organizationId, organizationId)))
    .limit(1);

  return row ?? null;
}
