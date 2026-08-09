import { and, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { expenses, projects, vendorContacts, vendorEngagements, vendors } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { normalizeVendorName } from '../domain/name-matching';
import type {
  VendorContactRecord,
  VendorDetail,
  VendorEngagementRecord,
  VendorEngagementSummary,
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

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(or(ilike(vendors.name, term), ilike(vendors.notes, term))!);
  }

  const rows = await db
    .select({
      vendor: vendors,
      engagementCount: sql<number>`(
        select count(*)::int from vendor_engagements ve
        where ve.vendor_id = ${vendors.id}
          and ve.organization_id = ${organizationId}
          and ve.archived_at is null
      )`,
      projectCount: sql<number>`(
        select count(distinct ve.project_id)::int from vendor_engagements ve
        where ve.vendor_id = ${vendors.id}
          and ve.organization_id = ${organizationId}
          and ve.archived_at is null
      )`,
    })
    .from(vendors)
    .where(and(...conditions))
    .orderBy(vendors.name);

  return rows.map((row) => ({
    ...mapVendor(row.vendor),
    engagementCount: row.engagementCount,
    projectCount: row.projectCount,
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
    .orderBy(projects.name);

  let parentVendorName: string | null = null;
  if (vendor.parentVendorId) {
    const parent = await findVendorById(db, organizationId, vendor.parentVendorId);
    parentVendorName = parent?.name ?? null;
  }

  const engagements: VendorEngagementSummary[] = engagementRows.map((row) => ({
    ...mapEngagement(row.engagement),
    projectName: row.projectName,
  }));

  return {
    ...vendor,
    contacts: contacts.map(mapContact),
    engagements,
    parentVendorName,
    projectCount: new Set(engagements.map((engagement) => engagement.projectId)).size,
  };
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
    })
    .returning();

  return mapEngagement(row!);
}

export async function archiveVendorEngagementById(
  db: DbExecutor,
  organizationId: string,
  engagementId: string,
): Promise<VendorEngagementRecord | null> {
  const [row] = await db
    .update(vendorEngagements)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(vendorEngagements.id, engagementId),
        eq(vendorEngagements.organizationId, organizationId),
      ),
    )
    .returning();

  return row ? mapEngagement(row) : null;
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
