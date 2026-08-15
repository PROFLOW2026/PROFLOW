import { and, desc, eq, gte, inArray, isNotNull, isNull, lte, notExists, sql } from 'drizzle-orm';
import {
  employeeMonthCosts,
  employees,
  nonProjectTimeCodes,
  projects,
  timeEntries,
  workPackages,
} from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import { areEmployeeMonthCostsAvailable } from '../domain/monthly-cost-gates';
import type {
  NonProjectTimeCodeRecord,
  TimeApprovalStatus,
  TimeEntryKind,
  TimeEntryListItem,
  TimeEntryRecord,
  TimeEntryStatus,
} from '../domain/types';

/**
 * When monthly employer costs are live, exclude time entries whose
 * (employee_id, YYYY-MM of work_date) matches an applied/closed
 * monthly_allocated employee_month_costs row (Displacement).
 */
function notDisplacedByMonthlyAllocation(db: DbExecutor, organizationId: string) {
  if (!areEmployeeMonthCostsAvailable()) return null;
  return notExists(
    db
      .select({ id: employeeMonthCosts.id })
      .from(employeeMonthCosts)
      .where(
        and(
          eq(employeeMonthCosts.organizationId, organizationId),
          eq(employeeMonthCosts.employeeId, timeEntries.employeeId),
          sql`${employeeMonthCosts.yearMonth} = to_char(${timeEntries.workDate}, 'YYYY-MM')`,
          inArray(employeeMonthCosts.status, ['applied', 'closed']),
          eq(employeeMonthCosts.recognitionSource, 'monthly_allocated'),
        ),
      ),
  );
}

function mapTimeEntry(row: typeof timeEntries.$inferSelect): TimeEntryRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    employeeId: row.employeeId,
    workDate: row.workDate,
    hours: row.hours,
    kind: row.kind,
    projectId: row.projectId,
    workPackageId: row.workPackageId,
    phaseId: row.phaseId,
    timeCodeId: row.timeCodeId,
    rateVersionId: row.rateVersionId,
    costAmount: row.costAmount,
    costCurrency: row.costCurrency,
    description: row.description,
    createdByUserId: row.createdByUserId,
    status: (row.status as TimeEntryStatus) ?? 'recorded',
    voidedAt: row.voidedAt ?? null,
    correctsEntryId: row.correctsEntryId ?? null,
    bulkBatchId: row.bulkBatchId ?? null,
    timesheetId: row.timesheetId ?? null,
    approvalStatus: (row.approvalStatus as TimeApprovalStatus) ?? 'draft',
    submittedAt: row.submittedAt ?? null,
    submittedByUserId: row.submittedByUserId ?? null,
    decidedAt: row.decidedAt ?? null,
    decidedByUserId: row.decidedByUserId ?? null,
    managerNote: row.managerNote ?? null,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapTimeCode(row: typeof nonProjectTimeCodes.$inferSelect): NonProjectTimeCodeRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    key: row.key,
    name: row.name,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertTimeEntry(
  db: DbExecutor,
  input: {
    organizationId: string;
    employeeId: string;
    workDate: string;
    hours: string;
    kind: TimeEntryKind;
    projectId?: string | null;
    workPackageId?: string | null;
    phaseId?: string | null;
    timeCodeId?: string | null;
    rateVersionId?: string | null;
    costAmount?: string | null;
    costCurrency?: string | null;
    description?: string | null;
    createdByUserId?: string | null;
    status?: TimeEntryStatus;
    voidedAt?: Date | null;
    correctsEntryId?: string | null;
    bulkBatchId?: string | null;
    timesheetId?: string | null;
    /** New logs default to draft — they do not create Actual until approved. */
    approvalStatus?: TimeApprovalStatus;
    submittedAt?: Date | null;
    submittedByUserId?: string | null;
    decidedAt?: Date | null;
    decidedByUserId?: string | null;
    managerNote?: string | null;
  },
): Promise<TimeEntryRecord> {
  const [row] = await db
    .insert(timeEntries)
    .values({
      organizationId: input.organizationId,
      employeeId: input.employeeId,
      workDate: input.workDate,
      hours: input.hours,
      kind: input.kind,
      projectId: input.projectId ?? null,
      workPackageId: input.workPackageId ?? null,
      phaseId: input.phaseId ?? null,
      timeCodeId: input.timeCodeId ?? null,
      rateVersionId: input.rateVersionId ?? null,
      costAmount: input.costAmount ?? null,
      costCurrency: input.costCurrency ?? null,
      description: input.description ?? null,
      createdByUserId: input.createdByUserId ?? null,
      status: input.status ?? 'recorded',
      voidedAt: input.voidedAt ?? null,
      correctsEntryId: input.correctsEntryId ?? null,
      bulkBatchId: input.bulkBatchId ?? null,
      timesheetId: input.timesheetId ?? null,
      approvalStatus: input.approvalStatus ?? 'draft',
      submittedAt: input.submittedAt ?? null,
      submittedByUserId: input.submittedByUserId ?? null,
      decidedAt: input.decidedAt ?? null,
      decidedByUserId: input.decidedByUserId ?? null,
      managerNote: input.managerNote ?? null,
    })
    .returning();

  return mapTimeEntry(row!);
}

/** Only call from `correctTimeEntry` after the `time_correction` approval gate. */
export async function voidTimeEntryRow(
  db: DbExecutor,
  organizationId: string,
  timeEntryId: string,
  voidedAt: Date,
): Promise<TimeEntryRecord | null> {
  const [row] = await db
    .update(timeEntries)
    .set({
      status: 'void',
      voidedAt,
      updatedAt: voidedAt,
    })
    .where(
      and(
        eq(timeEntries.id, timeEntryId),
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.status, 'recorded'),
      ),
    )
    .returning();

  return row ? mapTimeEntry(row) : null;
}

export interface TimeEntryFilters {
  readonly employeeId?: string;
  readonly projectId?: string;
  readonly fromDate?: string;
  readonly toDate?: string;
  readonly kind?: TimeEntryKind | 'all';
  /** Default `recorded` — void rows stay out of the working list unless requested. */
  readonly status?: TimeEntryStatus | 'all';
  /** Working lists omit this; costing callers must pass `approved`. */
  readonly approvalStatus?: TimeApprovalStatus | 'all';
  /**
   * Labor Actual slice: recorded + approved only (same gate as sum functions).
   * When true, overrides `status` / `approvalStatus` to the costing pair.
   */
  readonly forCosting?: boolean;
  readonly timesheetId?: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly offset?: number;
}

export async function listTimeEntries(
  db: DbExecutor,
  organizationId: string,
  filters: TimeEntryFilters = {},
): Promise<TimeEntryListItem[]> {
  const conditions = [eq(timeEntries.organizationId, organizationId)];

  if (!filters.includeArchived) {
    conditions.push(isNull(timeEntries.archivedAt));
  }

  if (filters.employeeId) {
    conditions.push(eq(timeEntries.employeeId, filters.employeeId));
  }

  if (filters.projectId) {
    conditions.push(eq(timeEntries.projectId, filters.projectId));
  }

  if (filters.fromDate) {
    conditions.push(gte(timeEntries.workDate, filters.fromDate));
  }

  if (filters.toDate) {
    conditions.push(lte(timeEntries.workDate, filters.toDate));
  }

  if (filters.kind && filters.kind !== 'all') {
    conditions.push(eq(timeEntries.kind, filters.kind));
  }

  if (filters.timesheetId) {
    conditions.push(eq(timeEntries.timesheetId, filters.timesheetId));
  }

  if (filters.forCosting) {
    conditions.push(eq(timeEntries.status, 'recorded'));
    conditions.push(eq(timeEntries.approvalStatus, 'approved'));
  } else {
    const statusFilter = filters.status ?? 'recorded';
    if (statusFilter !== 'all') {
      conditions.push(eq(timeEntries.status, statusFilter));
    }

    if (filters.approvalStatus && filters.approvalStatus !== 'all') {
      conditions.push(eq(timeEntries.approvalStatus, filters.approvalStatus));
    }
  }

  const hardCap =
    filters.limit != null && filters.limit > ORG_LIST_HARD_CAP
      ? ORG_LIST_EXPORT_CAP
      : ORG_LIST_HARD_CAP;

  const rows = await db
    .select({
      entry: timeEntries,
      employeeName: employees.name,
      projectName: projects.name,
      workPackageName: workPackages.name,
      timeCodeName: nonProjectTimeCodes.name,
    })
    .from(timeEntries)
    .innerJoin(employees, eq(timeEntries.employeeId, employees.id))
    .leftJoin(projects, eq(timeEntries.projectId, projects.id))
    .leftJoin(workPackages, eq(timeEntries.workPackageId, workPackages.id))
    .leftJoin(nonProjectTimeCodes, eq(timeEntries.timeCodeId, nonProjectTimeCodes.id))
    .where(and(...conditions))
    .orderBy(desc(timeEntries.workDate), desc(timeEntries.createdAt))
    .limit(resolveListLimit(filters.limit, { hardCap }))
    .offset(resolveListOffset(filters.offset));

  return rows.map((row) => ({
    ...mapTimeEntry(row.entry),
    employeeName: row.employeeName,
    projectName: row.projectName,
    workPackageName: row.workPackageName,
    timeCodeName: row.timeCodeName,
  }));
}

export async function findTimeEntryById(
  db: DbExecutor,
  organizationId: string,
  timeEntryId: string,
): Promise<TimeEntryRecord | null> {
  const [row] = await db
    .select()
    .from(timeEntries)
    .where(and(eq(timeEntries.id, timeEntryId), eq(timeEntries.organizationId, organizationId)))
    .limit(1);

  return row ? mapTimeEntry(row) : null;
}

export async function listTimeEntriesByIds(
  db: DbExecutor,
  organizationId: string,
  timeEntryIds: readonly string[],
): Promise<TimeEntryRecord[]> {
  if (timeEntryIds.length === 0) return [];

  const rows = await db
    .select()
    .from(timeEntries)
    .where(
      and(eq(timeEntries.organizationId, organizationId), inArray(timeEntries.id, [...timeEntryIds])),
    );

  return rows.map(mapTimeEntry);
}

export async function sumProjectLaborCost(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  projectCurrency: string,
): Promise<{
  totalAmount: string | null;
  currency: string | null;
  entryCount: number;
  entriesMissingCost: number;
  excludedForeignCurrencyEntries: number;
}> {
  const displacement = notDisplacedByMonthlyAllocation(db, organizationId);
  const [row] = await db
    .select({
      totalAmount: sql<string | null>`coalesce(
        sum(${timeEntries.costAmount}) filter (
          where upper(${timeEntries.costCurrency}) = upper(${projectCurrency})
        ),
        0
      )::text`,
      currency: sql<string | null>`upper(${projectCurrency})`,
      entryCount: sql<number>`count(*)::int`,
      entriesMissingCost: sql<number>`count(*) filter (where ${timeEntries.costAmount} is null)::int`,
      excludedForeignCurrencyEntries: sql<number>`count(*) filter (
        where ${timeEntries.costAmount} is not null
          and upper(${timeEntries.costCurrency}) <> upper(${projectCurrency})
      )::int`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        eq(timeEntries.projectId, projectId),
        eq(timeEntries.kind, 'project'),
        eq(timeEntries.status, 'recorded'),
        eq(timeEntries.approvalStatus, 'approved'),
        isNull(timeEntries.archivedAt),
        ...(displacement ? [displacement] : []),
      ),
    );

  return {
    totalAmount: row?.totalAmount ?? null,
    currency: row?.currency ?? null,
    entryCount: row?.entryCount ?? 0,
    entriesMissingCost: row?.entriesMissingCost ?? 0,
    excludedForeignCurrencyEntries: row?.excludedForeignCurrencyEntries ?? 0,
  };
}

export interface ProjectLaborCostAggregate {
  readonly projectId: string;
  readonly totalAmount: string | null;
  readonly currency: string;
  readonly entryCount: number;
  readonly entriesMissingCost: number;
  readonly excludedForeignCurrencyEntries: number;
}

/**
 * Labor cost per project in one grouped query (org rollup / set-based financials).
 * `projectCurrency` is the org base currency — callers only include matching projects.
 */
export async function sumLaborCostGroupedByProject(
  db: DbExecutor,
  organizationId: string,
  projectIds: readonly string[],
  projectCurrency: string,
): Promise<Map<string, ProjectLaborCostAggregate>> {
  const result = new Map<string, ProjectLaborCostAggregate>();
  if (projectIds.length === 0) return result;

  const displacement = notDisplacedByMonthlyAllocation(db, organizationId);
  const rows = await db
    .select({
      projectId: timeEntries.projectId,
      totalAmount: sql<string | null>`coalesce(
        sum(${timeEntries.costAmount}) filter (
          where upper(${timeEntries.costCurrency}) = upper(${projectCurrency})
        ),
        0
      )::text`,
      entryCount: sql<number>`count(*)::int`,
      entriesMissingCost: sql<number>`count(*) filter (where ${timeEntries.costAmount} is null)::int`,
      excludedForeignCurrencyEntries: sql<number>`count(*) filter (
        where ${timeEntries.costAmount} is not null
          and upper(${timeEntries.costCurrency}) <> upper(${projectCurrency})
      )::int`,
    })
    .from(timeEntries)
    .where(
      and(
        eq(timeEntries.organizationId, organizationId),
        inArray(timeEntries.projectId, [...projectIds]),
        eq(timeEntries.kind, 'project'),
        eq(timeEntries.status, 'recorded'),
        eq(timeEntries.approvalStatus, 'approved'),
        isNull(timeEntries.archivedAt),
        ...(displacement ? [displacement] : []),
      ),
    )
    .groupBy(timeEntries.projectId);

  const currency = projectCurrency.toUpperCase();
  for (const row of rows) {
    if (!row.projectId) continue;
    result.set(row.projectId, {
      projectId: row.projectId,
      totalAmount: row.totalAmount,
      currency,
      entryCount: row.entryCount,
      entriesMissingCost: row.entriesMissingCost,
      excludedForeignCurrencyEntries: row.excludedForeignCurrencyEntries,
    });
  }
  return result;
}

/** Org-wide project labor coverage flags for home dashboard (single query). */
export async function sumOrganizationProjectLaborCoverage(
  db: DbExecutor,
  organizationId: string,
  baseCurrency: string,
): Promise<{
  totalAmount: string | null;
  currency: string;
  entryCount: number;
  entriesMissingCost: number;
  excludedForeignCurrencyEntries: number;
  /** Projects with at least one project-kind time entry (Mode C present). */
  projectIdsWithLabor: readonly string[];
}> {
  const displacement = notDisplacedByMonthlyAllocation(db, organizationId);
  const laborConditions = and(
    eq(timeEntries.organizationId, organizationId),
    eq(timeEntries.kind, 'project'),
    eq(timeEntries.status, 'recorded'),
    eq(timeEntries.approvalStatus, 'approved'),
    isNull(timeEntries.archivedAt),
    isNotNull(timeEntries.projectId),
    ...(displacement ? [displacement] : []),
  );

  const [row] = await db
    .select({
      totalAmount: sql<string | null>`coalesce(
        sum(${timeEntries.costAmount}) filter (
          where upper(${timeEntries.costCurrency}) = upper(${baseCurrency})
        ),
        0
      )::text`,
      entryCount: sql<number>`count(*)::int`,
      entriesMissingCost: sql<number>`count(*) filter (where ${timeEntries.costAmount} is null)::int`,
      excludedForeignCurrencyEntries: sql<number>`count(*) filter (
        where ${timeEntries.costAmount} is not null
          and upper(${timeEntries.costCurrency}) <> upper(${baseCurrency})
      )::int`,
    })
    .from(timeEntries)
    .where(laborConditions);

  const projectIdRows = await db
    .selectDistinct({ projectId: timeEntries.projectId })
    .from(timeEntries)
    .where(laborConditions);

  return {
    totalAmount: row?.totalAmount ?? null,
    currency: baseCurrency.toUpperCase(),
    entryCount: row?.entryCount ?? 0,
    entriesMissingCost: row?.entriesMissingCost ?? 0,
    excludedForeignCurrencyEntries: row?.excludedForeignCurrencyEntries ?? 0,
    projectIdsWithLabor: projectIdRows
      .map((item) => item.projectId)
      .filter((id): id is string => typeof id === 'string'),
  };
}

export async function insertNonProjectTimeCode(
  db: DbExecutor,
  input: { organizationId: string; key: string; name: string },
): Promise<NonProjectTimeCodeRecord> {
  const [row] = await db
    .insert(nonProjectTimeCodes)
    .values({
      organizationId: input.organizationId,
      key: input.key,
      name: input.name,
    })
    .returning();

  return mapTimeCode(row!);
}

export async function listNonProjectTimeCodes(
  db: DbExecutor,
  organizationId: string,
): Promise<NonProjectTimeCodeRecord[]> {
  const rows = await db
    .select()
    .from(nonProjectTimeCodes)
    .where(and(eq(nonProjectTimeCodes.organizationId, organizationId), isNull(nonProjectTimeCodes.archivedAt)))
    .orderBy(nonProjectTimeCodes.name);

  return rows.map(mapTimeCode);
}

export async function findNonProjectTimeCodeById(
  db: DbExecutor,
  organizationId: string,
  timeCodeId: string,
): Promise<NonProjectTimeCodeRecord | null> {
  const [row] = await db
    .select()
    .from(nonProjectTimeCodes)
    .where(
      and(eq(nonProjectTimeCodes.id, timeCodeId), eq(nonProjectTimeCodes.organizationId, organizationId)),
    )
    .limit(1);

  return row ? mapTimeCode(row) : null;
}

export async function countNonProjectTimeCodes(db: DbExecutor, organizationId: string): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(nonProjectTimeCodes)
    .where(and(eq(nonProjectTimeCodes.organizationId, organizationId), isNull(nonProjectTimeCodes.archivedAt)));

  return row?.count ?? 0;
}
