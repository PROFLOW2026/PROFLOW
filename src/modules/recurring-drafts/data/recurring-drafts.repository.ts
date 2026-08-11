import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import {
  recurringFinancialDraftRuns,
  recurringFinancialDrafts,
} from '@drizzle/schema';
import { businessDate, type BusinessDate } from '@/shared/dates';
import {
  ORG_LIST_HARD_CAP,
  resolveListLimit,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  DraftFrequency,
  DraftKind,
  DraftStatus,
  RecurringDraftListFilters,
  RecurringFinancialDraftRecord,
  RecurringFinancialDraftRunRecord,
} from '../domain/types';
import { isDraftFrequency, isDraftKind, isDraftStatus } from '../domain/types';

function mapDraft(row: typeof recurringFinancialDrafts.$inferSelect): RecurringFinancialDraftRecord {
  if (!isDraftKind(row.draftKind)) {
    throw new Error(`Unknown recurring draft kind: ${row.draftKind}`);
  }
  if (!isDraftFrequency(row.frequency)) {
    throw new Error(`Unknown recurring draft frequency: ${row.frequency}`);
  }
  if (!isDraftStatus(row.status)) {
    throw new Error(`Unknown recurring draft status: ${row.status}`);
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    draftKind: row.draftKind,
    title: row.title,
    frequency: row.frequency,
    intervalCount: row.intervalCount,
    nextRunDate: businessDate(row.nextRunDate),
    endDate: row.endDate ? businessDate(row.endDate) : null,
    payloadJson: row.payloadJson,
    status: row.status,
    lastGeneratedAt: row.lastGeneratedAt,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapRun(
  row: typeof recurringFinancialDraftRuns.$inferSelect,
): RecurringFinancialDraftRunRecord {
  if (!isDraftKind(row.generatedEntityType)) {
    throw new Error(`Unknown generated entity type: ${row.generatedEntityType}`);
  }
  return {
    id: row.id,
    organizationId: row.organizationId,
    draftId: row.draftId,
    runDate: businessDate(row.runDate),
    generatedEntityType: row.generatedEntityType,
    generatedEntityId: row.generatedEntityId,
    notes: row.notes,
    createdAt: row.createdAt,
  };
}

export async function listRecurringDrafts(
  db: DbExecutor,
  organizationId: string,
  filters: RecurringDraftListFilters = {},
): Promise<RecurringFinancialDraftRecord[]> {
  const clauses = [eq(recurringFinancialDrafts.organizationId, organizationId), isNull(recurringFinancialDrafts.archivedAt)];
  if (filters.kind) clauses.push(eq(recurringFinancialDrafts.draftKind, filters.kind));
  if (filters.status) {
    clauses.push(eq(recurringFinancialDrafts.status, filters.status));
  } else if (!filters.includeEnded) {
    clauses.push(ne(recurringFinancialDrafts.status, 'ended'));
  }

  const rows = await db
    .select()
    .from(recurringFinancialDrafts)
    .where(and(...clauses))
    .orderBy(recurringFinancialDrafts.nextRunDate, recurringFinancialDrafts.title)
    .limit(resolveListLimit(undefined, { hardCap: ORG_LIST_HARD_CAP }));

  return rows.map(mapDraft);
}

export async function findRecurringDraftById(
  db: DbExecutor,
  organizationId: string,
  draftId: string,
): Promise<RecurringFinancialDraftRecord | null> {
  const [row] = await db
    .select()
    .from(recurringFinancialDrafts)
    .where(
      and(
        eq(recurringFinancialDrafts.id, draftId),
        eq(recurringFinancialDrafts.organizationId, organizationId),
        isNull(recurringFinancialDrafts.archivedAt),
      ),
    )
    .limit(1);
  return row ? mapDraft(row) : null;
}

export async function insertRecurringDraft(
  db: DbExecutor,
  values: {
    readonly organizationId: string;
    readonly draftKind: DraftKind;
    readonly title: string;
    readonly frequency: DraftFrequency;
    readonly intervalCount: number;
    readonly nextRunDate: BusinessDate;
    readonly endDate: BusinessDate | null;
    readonly payloadJson: unknown;
    readonly status?: DraftStatus;
  },
): Promise<RecurringFinancialDraftRecord> {
  const [row] = await db
    .insert(recurringFinancialDrafts)
    .values({
      organizationId: values.organizationId,
      draftKind: values.draftKind,
      title: values.title,
      frequency: values.frequency,
      intervalCount: values.intervalCount,
      nextRunDate: values.nextRunDate,
      endDate: values.endDate,
      payloadJson: values.payloadJson,
      status: values.status ?? 'active',
    })
    .returning();
  if (!row) throw new Error('Failed to insert recurring financial draft');
  return mapDraft(row);
}

export async function updateRecurringDraftById(
  db: DbExecutor,
  organizationId: string,
  draftId: string,
  patch: {
    readonly title?: string;
    readonly frequency?: DraftFrequency;
    readonly intervalCount?: number;
    readonly nextRunDate?: BusinessDate;
    readonly endDate?: BusinessDate | null;
    readonly payloadJson?: unknown;
    readonly status?: DraftStatus;
    readonly lastGeneratedAt?: Date | null;
  },
): Promise<RecurringFinancialDraftRecord | null> {
  const [row] = await db
    .update(recurringFinancialDrafts)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(recurringFinancialDrafts.id, draftId),
        eq(recurringFinancialDrafts.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapDraft(row) : null;
}

export async function listRunsForDraft(
  db: DbExecutor,
  organizationId: string,
  draftId: string,
): Promise<RecurringFinancialDraftRunRecord[]> {
  const rows = await db
    .select()
    .from(recurringFinancialDraftRuns)
    .where(
      and(
        eq(recurringFinancialDraftRuns.organizationId, organizationId),
        eq(recurringFinancialDraftRuns.draftId, draftId),
      ),
    )
    .orderBy(desc(recurringFinancialDraftRuns.runDate), desc(recurringFinancialDraftRuns.createdAt))
    .limit(ORG_LIST_HARD_CAP);
  return rows.map(mapRun);
}

export async function findRunByDraftAndDate(
  db: DbExecutor,
  organizationId: string,
  draftId: string,
  runDate: BusinessDate,
): Promise<RecurringFinancialDraftRunRecord | null> {
  const [row] = await db
    .select()
    .from(recurringFinancialDraftRuns)
    .where(
      and(
        eq(recurringFinancialDraftRuns.organizationId, organizationId),
        eq(recurringFinancialDraftRuns.draftId, draftId),
        eq(recurringFinancialDraftRuns.runDate, runDate),
      ),
    )
    .limit(1);
  return row ? mapRun(row) : null;
}

export async function insertRecurringDraftRun(
  db: DbExecutor,
  values: {
    readonly organizationId: string;
    readonly draftId: string;
    readonly runDate: BusinessDate;
    readonly generatedEntityType: DraftKind;
    readonly generatedEntityId: string;
    readonly notes?: string | null;
  },
): Promise<RecurringFinancialDraftRunRecord> {
  const [row] = await db
    .insert(recurringFinancialDraftRuns)
    .values({
      organizationId: values.organizationId,
      draftId: values.draftId,
      runDate: values.runDate,
      generatedEntityType: values.generatedEntityType,
      generatedEntityId: values.generatedEntityId,
      notes: values.notes ?? null,
    })
    .returning();
  if (!row) throw new Error('Failed to insert recurring draft run');
  return mapRun(row);
}
