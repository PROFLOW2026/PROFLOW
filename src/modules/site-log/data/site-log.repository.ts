import { and, asc, desc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { siteDailyLogEntries, siteDailyLogs, siteDailyReports, siteInstructions } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export type DailyLogRow = typeof siteDailyLogs.$inferSelect;
export type DailyLogEntryRow = typeof siteDailyLogEntries.$inferSelect;
export type DailyReportRow = typeof siteDailyReports.$inferSelect;

export async function findDailyLog(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  logDate: string,
): Promise<DailyLogRow | null> {
  const [row] = await db
    .select()
    .from(siteDailyLogs)
    .where(
      and(
        eq(siteDailyLogs.organizationId, organizationId),
        eq(siteDailyLogs.projectId, projectId),
        eq(siteDailyLogs.logDate, logDate),
      ),
    )
    .limit(1);
  return row ?? null;
}

/** Get-or-create the log row of a date (concurrent creators converge on the unique index). */
export async function ensureDailyLogRow(
  db: DbExecutor,
  values: { organizationId: string; projectId: string; logDate: string; createdByUserId: string },
): Promise<{ log: DailyLogRow; created: boolean }> {
  const inserted = await db
    .insert(siteDailyLogs)
    .values(values)
    .onConflictDoNothing({
      target: [siteDailyLogs.organizationId, siteDailyLogs.projectId, siteDailyLogs.logDate],
    })
    .returning();
  if (inserted[0]) return { log: inserted[0], created: true };
  const existing = await findDailyLog(db, values.organizationId, values.projectId, values.logDate);
  if (!existing) throw new Error('Daily log vanished after conflict');
  return { log: existing, created: false };
}

export async function updateDailyLogRow(
  db: DbExecutor,
  organizationId: string,
  logId: string,
  patch: Partial<Pick<DailyLogRow, 'weather' | 'notes' | 'status' | 'closedAt' | 'closedByUserId'>>,
): Promise<DailyLogRow | null> {
  const [row] = await db
    .update(siteDailyLogs)
    .set(patch)
    .where(and(eq(siteDailyLogs.id, logId), eq(siteDailyLogs.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export interface DailyLogListRow {
  readonly id: string;
  readonly logDate: string;
  readonly status: DailyLogRow['status'];
  readonly weather: string | null;
  readonly entryCount: number;
}

export async function listDailyLogsInWindow(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  fromDate: string,
  toDate: string,
): Promise<DailyLogListRow[]> {
  const rows = await db
    .select({
      id: siteDailyLogs.id,
      logDate: siteDailyLogs.logDate,
      status: siteDailyLogs.status,
      weather: siteDailyLogs.weather,
      entryCount: sql<number>`(
        select count(*)::int from public.site_daily_log_entries e
        where e.daily_log_id = site_daily_logs.id and e.organization_id = site_daily_logs.organization_id
      )`,
    })
    .from(siteDailyLogs)
    .where(
      and(
        eq(siteDailyLogs.organizationId, organizationId),
        eq(siteDailyLogs.projectId, projectId),
        gte(siteDailyLogs.logDate, fromDate),
        lte(siteDailyLogs.logDate, toDate),
      ),
    )
    .orderBy(desc(siteDailyLogs.logDate));
  return rows.map((row) => ({ ...row, entryCount: Number(row.entryCount) }));
}

export async function countReportsByDateInWindow(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  fromDate: string,
  toDate: string,
): Promise<Map<string, number>> {
  const rows = await db
    .select({
      reportDate: siteDailyReports.reportDate,
      parties: sql<number>`count(distinct (${siteDailyReports.vendorId}, coalesce(${siteDailyReports.subcontractAgreementId}, '00000000-0000-0000-0000-000000000000'::uuid)))::int`,
    })
    .from(siteDailyReports)
    .where(
      and(
        eq(siteDailyReports.organizationId, organizationId),
        eq(siteDailyReports.projectId, projectId),
        gte(siteDailyReports.reportDate, fromDate),
        lte(siteDailyReports.reportDate, toDate),
      ),
    )
    .groupBy(siteDailyReports.reportDate);
  return new Map(rows.map((row) => [row.reportDate, Number(row.parties)]));
}

export async function listEntriesForLog(
  db: DbExecutor,
  organizationId: string,
  logId: string,
): Promise<DailyLogEntryRow[]> {
  return db
    .select()
    .from(siteDailyLogEntries)
    .where(and(eq(siteDailyLogEntries.organizationId, organizationId), eq(siteDailyLogEntries.dailyLogId, logId)))
    .orderBy(asc(siteDailyLogEntries.entryType), asc(siteDailyLogEntries.sortOrder), asc(siteDailyLogEntries.createdAt))
    .limit(1000);
}

export async function findEntry(
  db: DbExecutor,
  organizationId: string,
  entryId: string,
): Promise<DailyLogEntryRow | null> {
  const [row] = await db
    .select()
    .from(siteDailyLogEntries)
    .where(and(eq(siteDailyLogEntries.id, entryId), eq(siteDailyLogEntries.organizationId, organizationId)))
    .limit(1);
  return row ?? null;
}

export async function insertEntry(
  db: DbExecutor,
  values: typeof siteDailyLogEntries.$inferInsert,
): Promise<DailyLogEntryRow> {
  const [row] = await db.insert(siteDailyLogEntries).values(values).returning();
  return row!;
}

export async function updateEntryRow(
  db: DbExecutor,
  organizationId: string,
  entryId: string,
  patch: Partial<typeof siteDailyLogEntries.$inferInsert>,
): Promise<DailyLogEntryRow | null> {
  const [row] = await db
    .update(siteDailyLogEntries)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(siteDailyLogEntries.id, entryId), eq(siteDailyLogEntries.organizationId, organizationId)))
    .returning();
  return row ?? null;
}

export async function deleteEntryRow(db: DbExecutor, organizationId: string, entryId: string): Promise<boolean> {
  const rows = await db
    .delete(siteDailyLogEntries)
    .where(and(eq(siteDailyLogEntries.id, entryId), eq(siteDailyLogEntries.organizationId, organizationId)))
    .returning({ id: siteDailyLogEntries.id });
  return rows.length > 0;
}

export async function nextEntrySortOrder(db: DbExecutor, organizationId: string, logId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`coalesce(max(${siteDailyLogEntries.sortOrder}), 0)::int` })
    .from(siteDailyLogEntries)
    .where(and(eq(siteDailyLogEntries.organizationId, organizationId), eq(siteDailyLogEntries.dailyLogId, logId)));
  return Number(row?.max ?? 0) + 1;
}

export async function listReportsForDate(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  reportDate: string,
): Promise<DailyReportRow[]> {
  return db
    .select()
    .from(siteDailyReports)
    .where(
      and(
        eq(siteDailyReports.organizationId, organizationId),
        eq(siteDailyReports.projectId, projectId),
        eq(siteDailyReports.reportDate, reportDate),
      ),
    )
    .orderBy(asc(siteDailyReports.vendorId), desc(siteDailyReports.revision))
    .limit(500);
}

export async function insertReport(
  db: DbExecutor,
  values: typeof siteDailyReports.$inferInsert,
): Promise<DailyReportRow> {
  const [row] = await db.insert(siteDailyReports).values(values).returning();
  return row!;
}

/** Contractor's own reports (RLS narrows to the principal's vendor scope). */
export async function listReportsForProject(
  db: DbExecutor,
  projectId: string,
  organizationIds: readonly string[],
  limit: number,
): Promise<DailyReportRow[]> {
  if (organizationIds.length === 0) return [];
  return db
    .select()
    .from(siteDailyReports)
    .where(and(eq(siteDailyReports.projectId, projectId), inArray(siteDailyReports.organizationId, [...organizationIds])))
    .orderBy(desc(siteDailyReports.reportDate), desc(siteDailyReports.revision))
    .limit(limit);
}

export interface InstructionOfDayRow {
  readonly id: string;
  readonly instructionNumber: number;
  readonly title: string;
  readonly category: string;
  readonly status: string;
  readonly vendorId: string;
}

/** Instructions linked to the log, or issued on that calendar date (organization time zone). */
export async function listInstructionsForDay(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  logDate: string,
  logId: string | null,
  timeZone: string,
): Promise<InstructionOfDayRow[]> {
  const issuedOnDate = sql`(${siteInstructions.issuedAt} at time zone ${timeZone})::date = ${logDate}::date`;
  return db
    .select({
      id: siteInstructions.id,
      instructionNumber: siteInstructions.instructionNumber,
      title: siteInstructions.title,
      category: siteInstructions.category,
      status: siteInstructions.status,
      vendorId: siteInstructions.vendorId,
    })
    .from(siteInstructions)
    .where(
      and(
        eq(siteInstructions.organizationId, organizationId),
        eq(siteInstructions.projectId, projectId),
        logId ? sql`(${siteInstructions.dailyLogId} = ${logId} or ${issuedOnDate})` : issuedOnDate,
      ),
    )
    .orderBy(asc(siteInstructions.instructionNumber))
    .limit(200);
}
