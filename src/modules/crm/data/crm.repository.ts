import { and, desc, eq, ilike, isNull, or } from 'drizzle-orm';
import {
  crmEstimates,
  crmLeads,
  crmOpportunities,
  crmOpportunityNotes,
  crmProspectContacts,
  crmProspects,
  crmSalesQuoteLines,
  crmSalesQuotes,
  crmSalesQuoteVersions,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  EstimateRecord,
  EstimateStatus,
  LeadListFilters,
  LeadRecord,
  LeadStatus,
  OpportunityListFilters,
  OpportunityNoteRecord,
  OpportunityRecord,
  OpportunityStage,
  OpportunityStatus,
  ProspectContactRecord,
  ProspectListFilters,
  ProspectRecord,
  ProspectStatus,
  SalesQuoteLineRecord,
  SalesQuoteRecord,
  SalesQuoteStatus,
  SalesQuoteVersionRecord,
  SalesQuoteVersionStatus,
} from '../domain/types';

function mapProspect(row: typeof crmProspects.$inferSelect): ProspectRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    name: row.name,
    status: row.status as ProspectStatus,
    email: row.email,
    phone: row.phone,
    companyName: row.companyName,
    notes: row.notes,
    convertedClientId: row.convertedClientId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapContact(row: typeof crmProspectContacts.$inferSelect): ProspectContactRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    prospectId: row.prospectId,
    name: row.name,
    email: row.email,
    phone: row.phone,
    role: row.role,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLead(row: typeof crmLeads.$inferSelect): LeadRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    prospectId: row.prospectId,
    title: row.title,
    source: row.source,
    status: row.status as LeadStatus,
    email: row.email,
    phone: row.phone,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapOpportunity(row: typeof crmOpportunities.$inferSelect): OpportunityRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    prospectId: row.prospectId,
    leadId: row.leadId,
    name: row.name,
    stage: row.stage as OpportunityStage,
    status: row.status as OpportunityStatus,
    expectedValueAmount: row.expectedValueAmount,
    currency: row.currency,
    expectedStartDate: row.expectedStartDate,
    referralSource: row.referralSource,
    lostReason: row.lostReason,
    convertedClientId: row.convertedClientId,
    convertedProjectId: row.convertedProjectId,
    convertedContractId: row.convertedContractId,
    convertedAt: row.convertedAt,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapNote(row: typeof crmOpportunityNotes.$inferSelect): OpportunityNoteRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    opportunityId: row.opportunityId,
    body: row.body,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEstimate(row: typeof crmEstimates.$inferSelect): EstimateRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    opportunityId: row.opportunityId,
    name: row.name,
    status: row.status as EstimateStatus,
    internalAmount: row.internalAmount,
    currency: row.currency,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapSalesQuote(row: typeof crmSalesQuotes.$inferSelect): SalesQuoteRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    opportunityId: row.opportunityId,
    title: row.title,
    status: row.status as SalesQuoteStatus,
    currency: row.currency,
    acceptedVersionId: row.acceptedVersionId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapVersion(row: typeof crmSalesQuoteVersions.$inferSelect): SalesQuoteVersionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    salesQuoteId: row.salesQuoteId,
    versionNumber: row.versionNumber,
    status: row.status as SalesQuoteVersionStatus,
    subtotalAmount: row.subtotalAmount,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    currency: row.currency,
    alternateLabel: row.alternateLabel,
    notes: row.notes,
    issuedAt: row.issuedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLine(row: typeof crmSalesQuoteLines.$inferSelect): SalesQuoteLineRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    versionId: row.versionId,
    description: row.description,
    quantity: row.quantity,
    unitAmount: row.unitAmount,
    lineTotal: row.lineTotal,
    currency: row.currency,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// —— Prospects ——

export async function insertProspect(
  db: DbExecutor,
  input: {
    organizationId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    companyName?: string | null;
    notes?: string | null;
  },
): Promise<ProspectRecord> {
  const [row] = await db
    .insert(crmProspects)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      companyName: input.companyName ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return mapProspect(row!);
}

export async function updateProspectById(
  db: DbExecutor,
  organizationId: string,
  prospectId: string,
  patch: Partial<{
    name: string;
    status: ProspectStatus;
    email: string | null;
    phone: string | null;
    companyName: string | null;
    notes: string | null;
    convertedClientId: string | null;
  }>,
): Promise<ProspectRecord | null> {
  const [row] = await db
    .update(crmProspects)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(crmProspects.id, prospectId), eq(crmProspects.organizationId, organizationId)))
    .returning();
  return row ? mapProspect(row) : null;
}

export async function findProspectById(
  db: DbExecutor,
  organizationId: string,
  prospectId: string,
): Promise<ProspectRecord | null> {
  const [row] = await db
    .select()
    .from(crmProspects)
    .where(and(eq(crmProspects.id, prospectId), eq(crmProspects.organizationId, organizationId)))
    .limit(1);
  return row ? mapProspect(row) : null;
}

export async function listProspects(
  db: DbExecutor,
  organizationId: string,
  filters: ProspectListFilters = {},
): Promise<ProspectRecord[]> {
  const conditions = [eq(crmProspects.organizationId, organizationId)];
  if (!filters.includeArchived) conditions.push(isNull(crmProspects.archivedAt));
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(crmProspects.status, filters.status));
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(
      or(ilike(crmProspects.name, term), ilike(crmProspects.companyName, term))!,
    );
  }
  const rows = await db
    .select()
    .from(crmProspects)
    .where(and(...conditions))
    .orderBy(desc(crmProspects.updatedAt));
  return rows.map(mapProspect);
}

export async function insertProspectContact(
  db: DbExecutor,
  input: {
    organizationId: string;
    prospectId: string;
    name: string;
    email?: string | null;
    phone?: string | null;
    role?: string | null;
  },
): Promise<ProspectContactRecord> {
  const [row] = await db
    .insert(crmProspectContacts)
    .values({
      organizationId: input.organizationId,
      prospectId: input.prospectId,
      name: input.name,
      email: input.email ?? null,
      phone: input.phone ?? null,
      role: input.role ?? null,
    })
    .returning();
  return mapContact(row!);
}

export async function listProspectContacts(
  db: DbExecutor,
  organizationId: string,
  prospectId: string,
): Promise<ProspectContactRecord[]> {
  const rows = await db
    .select()
    .from(crmProspectContacts)
    .where(
      and(
        eq(crmProspectContacts.organizationId, organizationId),
        eq(crmProspectContacts.prospectId, prospectId),
      ),
    )
    .orderBy(crmProspectContacts.name);
  return rows.map(mapContact);
}

// —— Leads ——

export async function insertLead(
  db: DbExecutor,
  input: {
    organizationId: string;
    title: string;
    prospectId?: string | null;
    source?: string | null;
    email?: string | null;
    phone?: string | null;
    notes?: string | null;
    status?: LeadStatus;
  },
): Promise<LeadRecord> {
  const [row] = await db
    .insert(crmLeads)
    .values({
      organizationId: input.organizationId,
      title: input.title,
      prospectId: input.prospectId ?? null,
      source: input.source ?? null,
      email: input.email ?? null,
      phone: input.phone ?? null,
      notes: input.notes ?? null,
      status: input.status ?? 'new',
    })
    .returning();
  return mapLead(row!);
}

export async function updateLeadById(
  db: DbExecutor,
  organizationId: string,
  leadId: string,
  patch: Partial<{
    title: string;
    prospectId: string | null;
    source: string | null;
    status: LeadStatus;
    email: string | null;
    phone: string | null;
    notes: string | null;
  }>,
): Promise<LeadRecord | null> {
  const [row] = await db
    .update(crmLeads)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(crmLeads.id, leadId), eq(crmLeads.organizationId, organizationId)))
    .returning();
  return row ? mapLead(row) : null;
}

export async function findLeadById(
  db: DbExecutor,
  organizationId: string,
  leadId: string,
): Promise<LeadRecord | null> {
  const [row] = await db
    .select()
    .from(crmLeads)
    .where(and(eq(crmLeads.id, leadId), eq(crmLeads.organizationId, organizationId)))
    .limit(1);
  return row ? mapLead(row) : null;
}

export async function listLeads(
  db: DbExecutor,
  organizationId: string,
  filters: LeadListFilters = {},
): Promise<LeadRecord[]> {
  const conditions = [eq(crmLeads.organizationId, organizationId)];
  if (!filters.includeArchived) conditions.push(isNull(crmLeads.archivedAt));
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(crmLeads.status, filters.status));
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(ilike(crmLeads.title, term));
  }
  const rows = await db
    .select()
    .from(crmLeads)
    .where(and(...conditions))
    .orderBy(desc(crmLeads.updatedAt));
  return rows.map(mapLead);
}

// —— Opportunities ——

export async function insertOpportunity(
  db: DbExecutor,
  input: {
    organizationId: string;
    name: string;
    prospectId?: string | null;
    leadId?: string | null;
    stage?: OpportunityStage;
    expectedValueAmount?: string | null;
    currency?: string | null;
    expectedStartDate?: string | null;
    referralSource?: string | null;
    notes?: string | null;
  },
): Promise<OpportunityRecord> {
  const [row] = await db
    .insert(crmOpportunities)
    .values({
      organizationId: input.organizationId,
      name: input.name,
      prospectId: input.prospectId ?? null,
      leadId: input.leadId ?? null,
      stage: input.stage ?? 'qualify',
      expectedValueAmount: input.expectedValueAmount ?? null,
      currency: input.currency ?? null,
      expectedStartDate: input.expectedStartDate ?? null,
      referralSource: input.referralSource ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return mapOpportunity(row!);
}

export async function updateOpportunityById(
  db: DbExecutor,
  organizationId: string,
  opportunityId: string,
  patch: Partial<{
    name: string;
    prospectId: string | null;
    leadId: string | null;
    stage: OpportunityStage;
    status: OpportunityStatus;
    expectedValueAmount: string | null;
    currency: string | null;
    expectedStartDate: string | null;
    referralSource: string | null;
    lostReason: string | null;
    notes: string | null;
    convertedClientId: string | null;
    convertedProjectId: string | null;
    convertedContractId: string | null;
    convertedAt: Date | null;
  }>,
): Promise<OpportunityRecord | null> {
  const [row] = await db
    .update(crmOpportunities)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(crmOpportunities.id, opportunityId), eq(crmOpportunities.organizationId, organizationId)),
    )
    .returning();
  return row ? mapOpportunity(row) : null;
}

export async function findOpportunityById(
  db: DbExecutor,
  organizationId: string,
  opportunityId: string,
): Promise<OpportunityRecord | null> {
  const [row] = await db
    .select()
    .from(crmOpportunities)
    .where(
      and(eq(crmOpportunities.id, opportunityId), eq(crmOpportunities.organizationId, organizationId)),
    )
    .limit(1);
  return row ? mapOpportunity(row) : null;
}

export async function listOpportunities(
  db: DbExecutor,
  organizationId: string,
  filters: OpportunityListFilters = {},
): Promise<OpportunityRecord[]> {
  const conditions = [eq(crmOpportunities.organizationId, organizationId)];
  if (!filters.includeArchived) conditions.push(isNull(crmOpportunities.archivedAt));
  if (filters.status && filters.status !== 'all') {
    conditions.push(eq(crmOpportunities.status, filters.status));
  }
  if (filters.stage && filters.stage !== 'all') {
    conditions.push(eq(crmOpportunities.stage, filters.stage));
  }
  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(ilike(crmOpportunities.name, term));
  }
  const rows = await db
    .select()
    .from(crmOpportunities)
    .where(and(...conditions))
    .orderBy(desc(crmOpportunities.updatedAt));
  return rows.map(mapOpportunity);
}

export async function insertOpportunityNote(
  db: DbExecutor,
  input: {
    organizationId: string;
    opportunityId: string;
    body: string;
    createdByUserId?: string | null;
  },
): Promise<OpportunityNoteRecord> {
  const [row] = await db
    .insert(crmOpportunityNotes)
    .values({
      organizationId: input.organizationId,
      opportunityId: input.opportunityId,
      body: input.body,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();
  return mapNote(row!);
}

export async function listOpportunityNotes(
  db: DbExecutor,
  organizationId: string,
  opportunityId: string,
): Promise<OpportunityNoteRecord[]> {
  const rows = await db
    .select()
    .from(crmOpportunityNotes)
    .where(
      and(
        eq(crmOpportunityNotes.organizationId, organizationId),
        eq(crmOpportunityNotes.opportunityId, opportunityId),
      ),
    )
    .orderBy(desc(crmOpportunityNotes.createdAt));
  return rows.map(mapNote);
}

// —— Estimates ——

export async function insertEstimate(
  db: DbExecutor,
  input: {
    organizationId: string;
    opportunityId: string;
    name: string;
    internalAmount?: string | null;
    currency: string;
    notes?: string | null;
    status?: EstimateStatus;
  },
): Promise<EstimateRecord> {
  const [row] = await db
    .insert(crmEstimates)
    .values({
      organizationId: input.organizationId,
      opportunityId: input.opportunityId,
      name: input.name,
      internalAmount: input.internalAmount ?? null,
      currency: input.currency,
      notes: input.notes ?? null,
      status: input.status ?? 'draft',
    })
    .returning();
  return mapEstimate(row!);
}

export async function updateEstimateById(
  db: DbExecutor,
  organizationId: string,
  estimateId: string,
  patch: Partial<{
    name: string;
    internalAmount: string | null;
    currency: string;
    notes: string | null;
    status: EstimateStatus;
  }>,
): Promise<EstimateRecord | null> {
  const [row] = await db
    .update(crmEstimates)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(crmEstimates.id, estimateId), eq(crmEstimates.organizationId, organizationId)))
    .returning();
  return row ? mapEstimate(row) : null;
}

export async function findEstimateById(
  db: DbExecutor,
  organizationId: string,
  estimateId: string,
): Promise<EstimateRecord | null> {
  const [row] = await db
    .select()
    .from(crmEstimates)
    .where(and(eq(crmEstimates.id, estimateId), eq(crmEstimates.organizationId, organizationId)))
    .limit(1);
  return row ? mapEstimate(row) : null;
}

export async function listEstimatesForOpportunity(
  db: DbExecutor,
  organizationId: string,
  opportunityId: string,
): Promise<EstimateRecord[]> {
  const rows = await db
    .select()
    .from(crmEstimates)
    .where(
      and(
        eq(crmEstimates.organizationId, organizationId),
        eq(crmEstimates.opportunityId, opportunityId),
        isNull(crmEstimates.archivedAt),
      ),
    )
    .orderBy(desc(crmEstimates.updatedAt));
  return rows.map(mapEstimate);
}

// —— Sales quotes ——

export async function insertSalesQuote(
  db: DbExecutor,
  input: {
    organizationId: string;
    opportunityId: string;
    title: string;
    currency: string;
  },
): Promise<SalesQuoteRecord> {
  const [row] = await db
    .insert(crmSalesQuotes)
    .values({
      organizationId: input.organizationId,
      opportunityId: input.opportunityId,
      title: input.title,
      currency: input.currency,
    })
    .returning();
  return mapSalesQuote(row!);
}

export async function updateSalesQuoteById(
  db: DbExecutor,
  organizationId: string,
  salesQuoteId: string,
  patch: Partial<{
    title: string;
    status: SalesQuoteStatus;
    acceptedVersionId: string | null;
  }>,
): Promise<SalesQuoteRecord | null> {
  const [row] = await db
    .update(crmSalesQuotes)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(crmSalesQuotes.id, salesQuoteId), eq(crmSalesQuotes.organizationId, organizationId)),
    )
    .returning();
  return row ? mapSalesQuote(row) : null;
}

export async function findSalesQuoteById(
  db: DbExecutor,
  organizationId: string,
  salesQuoteId: string,
): Promise<SalesQuoteRecord | null> {
  const [row] = await db
    .select()
    .from(crmSalesQuotes)
    .where(
      and(eq(crmSalesQuotes.id, salesQuoteId), eq(crmSalesQuotes.organizationId, organizationId)),
    )
    .limit(1);
  return row ? mapSalesQuote(row) : null;
}

export async function listSalesQuotesForOpportunity(
  db: DbExecutor,
  organizationId: string,
  opportunityId: string,
): Promise<SalesQuoteRecord[]> {
  const rows = await db
    .select()
    .from(crmSalesQuotes)
    .where(
      and(
        eq(crmSalesQuotes.organizationId, organizationId),
        eq(crmSalesQuotes.opportunityId, opportunityId),
        isNull(crmSalesQuotes.archivedAt),
      ),
    )
    .orderBy(desc(crmSalesQuotes.updatedAt));
  return rows.map(mapSalesQuote);
}

export async function nextSalesQuoteVersionNumber(
  db: DbExecutor,
  organizationId: string,
  salesQuoteId: string,
): Promise<number> {
  const [row] = await db
    .select({ versionNumber: crmSalesQuoteVersions.versionNumber })
    .from(crmSalesQuoteVersions)
    .where(
      and(
        eq(crmSalesQuoteVersions.organizationId, organizationId),
        eq(crmSalesQuoteVersions.salesQuoteId, salesQuoteId),
      ),
    )
    .orderBy(desc(crmSalesQuoteVersions.versionNumber))
    .limit(1);
  return (row?.versionNumber ?? 0) + 1;
}

export async function insertSalesQuoteVersion(
  db: DbExecutor,
  input: {
    organizationId: string;
    salesQuoteId: string;
    versionNumber: number;
    subtotalAmount: string;
    taxAmount?: string | null;
    totalAmount: string;
    currency: string;
    alternateLabel?: string | null;
    notes?: string | null;
    status?: SalesQuoteVersionStatus;
  },
): Promise<SalesQuoteVersionRecord> {
  const [row] = await db
    .insert(crmSalesQuoteVersions)
    .values({
      organizationId: input.organizationId,
      salesQuoteId: input.salesQuoteId,
      versionNumber: input.versionNumber,
      subtotalAmount: input.subtotalAmount,
      taxAmount: input.taxAmount ?? null,
      totalAmount: input.totalAmount,
      currency: input.currency,
      alternateLabel: input.alternateLabel ?? null,
      notes: input.notes ?? null,
      status: input.status ?? 'draft',
    })
    .returning();
  return mapVersion(row!);
}

export async function updateSalesQuoteVersionById(
  db: DbExecutor,
  organizationId: string,
  versionId: string,
  patch: Partial<{
    status: SalesQuoteVersionStatus;
    issuedAt: Date | null;
  }>,
): Promise<SalesQuoteVersionRecord | null> {
  const [row] = await db
    .update(crmSalesQuoteVersions)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(crmSalesQuoteVersions.id, versionId),
        eq(crmSalesQuoteVersions.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapVersion(row) : null;
}

export async function findSalesQuoteVersionById(
  db: DbExecutor,
  organizationId: string,
  versionId: string,
): Promise<SalesQuoteVersionRecord | null> {
  const [row] = await db
    .select()
    .from(crmSalesQuoteVersions)
    .where(
      and(
        eq(crmSalesQuoteVersions.id, versionId),
        eq(crmSalesQuoteVersions.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? mapVersion(row) : null;
}

export async function listSalesQuoteVersions(
  db: DbExecutor,
  organizationId: string,
  salesQuoteId: string,
): Promise<SalesQuoteVersionRecord[]> {
  const rows = await db
    .select()
    .from(crmSalesQuoteVersions)
    .where(
      and(
        eq(crmSalesQuoteVersions.organizationId, organizationId),
        eq(crmSalesQuoteVersions.salesQuoteId, salesQuoteId),
      ),
    )
    .orderBy(desc(crmSalesQuoteVersions.versionNumber));
  return rows.map(mapVersion);
}

export async function supersedeDraftAndIssuedVersions(
  db: DbExecutor,
  organizationId: string,
  salesQuoteId: string,
  exceptVersionId?: string,
): Promise<void> {
  const versions = await listSalesQuoteVersions(db, organizationId, salesQuoteId);
  for (const version of versions) {
    if (exceptVersionId && version.id === exceptVersionId) continue;
    if (version.status === 'draft' || version.status === 'issued') {
      await updateSalesQuoteVersionById(db, organizationId, version.id, {
        status: 'superseded',
      });
    }
  }
}

export async function replaceSalesQuoteLines(
  db: DbExecutor,
  organizationId: string,
  versionId: string,
  lines: readonly {
    description: string;
    quantity: string;
    unitAmount: string;
    lineTotal: string;
    currency: string;
    sortOrder: number;
  }[],
): Promise<SalesQuoteLineRecord[]> {
  await db
    .delete(crmSalesQuoteLines)
    .where(
      and(
        eq(crmSalesQuoteLines.versionId, versionId),
        eq(crmSalesQuoteLines.organizationId, organizationId),
      ),
    );

  if (lines.length === 0) return [];

  const rows = await db
    .insert(crmSalesQuoteLines)
    .values(
      lines.map((line) => ({
        organizationId,
        versionId,
        description: line.description,
        quantity: line.quantity,
        unitAmount: line.unitAmount,
        lineTotal: line.lineTotal,
        currency: line.currency,
        sortOrder: line.sortOrder,
      })),
    )
    .returning();

  return rows.map(mapLine);
}

export async function listSalesQuoteLines(
  db: DbExecutor,
  organizationId: string,
  versionId: string,
): Promise<SalesQuoteLineRecord[]> {
  const rows = await db
    .select()
    .from(crmSalesQuoteLines)
    .where(
      and(
        eq(crmSalesQuoteLines.organizationId, organizationId),
        eq(crmSalesQuoteLines.versionId, versionId),
      ),
    )
    .orderBy(crmSalesQuoteLines.sortOrder);
  return rows.map(mapLine);
}

export async function findAcceptedVersionForOpportunity(
  db: DbExecutor,
  organizationId: string,
  opportunityId: string,
): Promise<SalesQuoteVersionRecord | null> {
  const quotes = await listSalesQuotesForOpportunity(db, organizationId, opportunityId);
  for (const quote of quotes) {
    if (quote.acceptedVersionId) {
      const version = await findSalesQuoteVersionById(
        db,
        organizationId,
        quote.acceptedVersionId,
      );
      if (version?.status === 'accepted') return version;
    }
  }
  return null;
}
