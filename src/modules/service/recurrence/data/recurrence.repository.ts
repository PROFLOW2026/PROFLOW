import { and, asc, desc, eq, ilike, isNull, ne, sql } from 'drizzle-orm';
import {
  clients,
  projects,
  recurrenceDefinitions,
  recurrenceOccurrences,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  RecurrenceDefinitionListItem,
  RecurrenceDefinitionRecord,
  RecurrenceDefinitionStatus,
  RecurrenceFrequency,
  RecurrenceOccurrenceListItem,
  RecurrenceOccurrenceRecord,
  RecurrenceOccurrenceStatus,
} from '../domain/types';

function mapDefinition(
  row: typeof recurrenceDefinitions.$inferSelect,
): RecurrenceDefinitionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    title: row.title,
    siteAddress: row.siteAddress,
    frequency: row.frequency as RecurrenceFrequency,
    intervalCount: row.intervalCount,
    startDate: row.startDate,
    endDate: row.endDate,
    nextOccurrenceDate: row.nextOccurrenceDate,
    defaultDurationMinutes: row.defaultDurationMinutes,
    defaultPricingMode: row.defaultPricingMode,
    defaultPriceAmount: row.defaultPriceAmount,
    currency: row.currency,
    defaultChecklistTemplateId: row.defaultChecklistTemplateId,
    defaultAssigneeEmployeeId: row.defaultAssigneeEmployeeId,
    status: row.status as RecurrenceDefinitionStatus,
    notes: row.notes,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapOccurrence(
  row: typeof recurrenceOccurrences.$inferSelect,
): RecurrenceOccurrenceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    recurrenceDefinitionId: row.recurrenceDefinitionId,
    occurrenceDate: row.occurrenceDate,
    status: row.status as RecurrenceOccurrenceStatus,
    generatedProjectId: row.generatedProjectId,
    skippedReason: row.skippedReason,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertRecurrenceDefinition(
  db: DbExecutor,
  input: {
    organizationId: string;
    clientId?: string | null;
    title: string;
    siteAddress?: string | null;
    frequency: RecurrenceFrequency;
    intervalCount: number;
    startDate: string;
    endDate?: string | null;
    nextOccurrenceDate?: string | null;
    defaultDurationMinutes?: number | null;
    defaultPricingMode?: string | null;
    defaultPriceAmount?: string | null;
    currency?: string | null;
    defaultChecklistTemplateId?: string | null;
    defaultAssigneeEmployeeId?: string | null;
    status?: RecurrenceDefinitionStatus;
    notes?: string | null;
  },
): Promise<RecurrenceDefinitionRecord> {
  const [row] = await db
    .insert(recurrenceDefinitions)
    .values({
      organizationId: input.organizationId,
      clientId: input.clientId ?? null,
      title: input.title,
      siteAddress: input.siteAddress ?? null,
      frequency: input.frequency,
      intervalCount: input.intervalCount,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      nextOccurrenceDate: input.nextOccurrenceDate ?? input.startDate,
      defaultDurationMinutes: input.defaultDurationMinutes ?? null,
      defaultPricingMode: input.defaultPricingMode ?? null,
      defaultPriceAmount: input.defaultPriceAmount ?? null,
      currency: input.currency ?? null,
      defaultChecklistTemplateId: input.defaultChecklistTemplateId ?? null,
      defaultAssigneeEmployeeId: input.defaultAssigneeEmployeeId ?? null,
      status: input.status ?? 'active',
      notes: input.notes ?? null,
    })
    .returning();

  return mapDefinition(row!);
}

export async function updateRecurrenceDefinitionById(
  db: DbExecutor,
  organizationId: string,
  definitionId: string,
  patch: Partial<{
    clientId: string | null;
    title: string;
    siteAddress: string | null;
    frequency: RecurrenceFrequency;
    intervalCount: number;
    startDate: string;
    endDate: string | null;
    nextOccurrenceDate: string | null;
    defaultDurationMinutes: number | null;
    defaultPricingMode: string | null;
    defaultPriceAmount: string | null;
    currency: string | null;
    defaultChecklistTemplateId: string | null;
    defaultAssigneeEmployeeId: string | null;
    status: RecurrenceDefinitionStatus;
    notes: string | null;
    archivedAt: Date | null;
  }>,
): Promise<RecurrenceDefinitionRecord | null> {
  const [row] = await db
    .update(recurrenceDefinitions)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(recurrenceDefinitions.id, definitionId),
        eq(recurrenceDefinitions.organizationId, organizationId),
      ),
    )
    .returning();

  return row ? mapDefinition(row) : null;
}

export async function findRecurrenceDefinitionById(
  db: DbExecutor,
  organizationId: string,
  definitionId: string,
): Promise<RecurrenceDefinitionRecord | null> {
  const [row] = await db
    .select()
    .from(recurrenceDefinitions)
    .where(
      and(
        eq(recurrenceDefinitions.id, definitionId),
        eq(recurrenceDefinitions.organizationId, organizationId),
        isNull(recurrenceDefinitions.archivedAt),
      ),
    )
    .limit(1);

  return row ? mapDefinition(row) : null;
}

export async function listRecurrenceDefinitions(
  db: DbExecutor,
  organizationId: string,
  filters: {
    status?: RecurrenceDefinitionStatus;
    search?: string | null;
    includeEnded?: boolean;
  } = {},
): Promise<RecurrenceDefinitionListItem[]> {
  const conditions = [
    eq(recurrenceDefinitions.organizationId, organizationId),
    isNull(recurrenceDefinitions.archivedAt),
  ];

  if (filters.status) {
    conditions.push(eq(recurrenceDefinitions.status, filters.status));
  } else if (!filters.includeEnded) {
    conditions.push(ne(recurrenceDefinitions.status, 'ended'));
  }

  if (filters.search?.trim()) {
    conditions.push(ilike(recurrenceDefinitions.title, `%${filters.search.trim()}%`));
  }

  const rows = await db
    .select({
      definition: recurrenceDefinitions,
      clientName: clients.name,
    })
    .from(recurrenceDefinitions)
    .leftJoin(
      clients,
      and(
        eq(clients.id, recurrenceDefinitions.clientId),
        eq(clients.organizationId, recurrenceDefinitions.organizationId),
      ),
    )
    .where(and(...conditions))
    .orderBy(
      asc(recurrenceDefinitions.status),
      asc(recurrenceDefinitions.nextOccurrenceDate),
      desc(recurrenceDefinitions.updatedAt),
    )
    .limit(200);

  return rows.map((row) => ({
    ...mapDefinition(row.definition),
    clientName: row.clientName ?? null,
  }));
}

export async function insertRecurrenceOccurrence(
  db: DbExecutor,
  input: {
    organizationId: string;
    recurrenceDefinitionId: string;
    occurrenceDate: string;
    status?: RecurrenceOccurrenceStatus;
    generatedProjectId?: string | null;
    skippedReason?: string | null;
  },
): Promise<RecurrenceOccurrenceRecord> {
  const [row] = await db
    .insert(recurrenceOccurrences)
    .values({
      organizationId: input.organizationId,
      recurrenceDefinitionId: input.recurrenceDefinitionId,
      occurrenceDate: input.occurrenceDate,
      status: input.status ?? 'planned',
      generatedProjectId: input.generatedProjectId ?? null,
      skippedReason: input.skippedReason ?? null,
    })
    .returning();

  return mapOccurrence(row!);
}

export async function findOccurrenceByDefinitionDate(
  db: DbExecutor,
  organizationId: string,
  definitionId: string,
  occurrenceDate: string,
): Promise<RecurrenceOccurrenceRecord | null> {
  const [row] = await db
    .select()
    .from(recurrenceOccurrences)
    .where(
      and(
        eq(recurrenceOccurrences.organizationId, organizationId),
        eq(recurrenceOccurrences.recurrenceDefinitionId, definitionId),
        eq(recurrenceOccurrences.occurrenceDate, occurrenceDate),
      ),
    )
    .limit(1);

  return row ? mapOccurrence(row) : null;
}

export async function updateRecurrenceOccurrenceById(
  db: DbExecutor,
  organizationId: string,
  occurrenceId: string,
  patch: Partial<{
    status: RecurrenceOccurrenceStatus;
    generatedProjectId: string | null;
    skippedReason: string | null;
  }>,
): Promise<RecurrenceOccurrenceRecord | null> {
  const [row] = await db
    .update(recurrenceOccurrences)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(recurrenceOccurrences.id, occurrenceId),
        eq(recurrenceOccurrences.organizationId, organizationId),
      ),
    )
    .returning();

  return row ? mapOccurrence(row) : null;
}

export async function listOccurrencesForDefinition(
  db: DbExecutor,
  organizationId: string,
  definitionId: string,
  options: { limit?: number } = {},
): Promise<RecurrenceOccurrenceListItem[]> {
  const rows = await db
    .select({
      occurrence: recurrenceOccurrences,
      generatedProjectName: projects.name,
    })
    .from(recurrenceOccurrences)
    .leftJoin(
      projects,
      and(
        eq(projects.id, recurrenceOccurrences.generatedProjectId),
        eq(projects.organizationId, recurrenceOccurrences.organizationId),
      ),
    )
    .where(
      and(
        eq(recurrenceOccurrences.organizationId, organizationId),
        eq(recurrenceOccurrences.recurrenceDefinitionId, definitionId),
      ),
    )
    .orderBy(desc(recurrenceOccurrences.occurrenceDate), desc(recurrenceOccurrences.createdAt))
    .limit(options.limit ?? 100);

  return rows.map((row) => ({
    ...mapOccurrence(row.occurrence),
    generatedProjectName: row.generatedProjectName ?? null,
  }));
}

/** Upsert-friendly insert that ignores unique conflicts on (org, def, date). */
export async function ensurePlannedOccurrence(
  db: DbExecutor,
  input: {
    organizationId: string;
    recurrenceDefinitionId: string;
    occurrenceDate: string;
  },
): Promise<RecurrenceOccurrenceRecord> {
  const existing = await findOccurrenceByDefinitionDate(
    db,
    input.organizationId,
    input.recurrenceDefinitionId,
    input.occurrenceDate,
  );
  if (existing) return existing;

  try {
    return await insertRecurrenceOccurrence(db, {
      ...input,
      status: 'planned',
    });
  } catch (error) {
    // Race on unique index — re-read.
    const raced = await findOccurrenceByDefinitionDate(
      db,
      input.organizationId,
      input.recurrenceDefinitionId,
      input.occurrenceDate,
    );
    if (raced) return raced;
    throw error;
  }
}

export async function countGeneratedOccurrences(
  db: DbExecutor,
  organizationId: string,
  definitionId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(recurrenceOccurrences)
    .where(
      and(
        eq(recurrenceOccurrences.organizationId, organizationId),
        eq(recurrenceOccurrences.recurrenceDefinitionId, definitionId),
        eq(recurrenceOccurrences.status, 'generated'),
      ),
    );

  return Number(row?.count ?? 0);
}
