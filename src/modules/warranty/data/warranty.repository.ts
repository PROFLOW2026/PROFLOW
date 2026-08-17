import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { projects, warrantyCoverages, warrantyIssues } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  WarrantyCoverageRecord,
  WarrantyCoverageStatus,
  WarrantyCoverageType,
  WarrantyIssueRecord,
  WarrantyIssueStatus,
} from '../domain/types';

function asDateString(value: string | Date | null): string | null {
  if (value == null) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapCoverage(row: typeof warrantyCoverages.$inferSelect): WarrantyCoverageRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    workPackageId: row.workPackageId,
    vendorId: row.vendorId,
    coverageType: row.coverageType as WarrantyCoverageType,
    title: row.title,
    notes: row.notes,
    startDate: asDateString(row.startDate),
    endDate: asDateString(row.endDate),
    status: row.status as WarrantyCoverageStatus,
    reminderDaysBefore: row.reminderDaysBefore,
    archivedAt: row.archivedAt,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapIssue(row: typeof warrantyIssues.$inferSelect): WarrantyIssueRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    coverageId: row.coverageId,
    projectId: row.projectId,
    workOrderId: row.workOrderId,
    title: row.title,
    notes: row.notes,
    status: row.status as WarrantyIssueStatus,
    reportedAt: row.reportedAt,
    resolvedAt: row.resolvedAt,
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function findCoverageById(
  db: DbExecutor,
  organizationId: string,
  coverageId: string,
): Promise<WarrantyCoverageRecord | null> {
  const [row] = await db
    .select()
    .from(warrantyCoverages)
    .where(
      and(
        eq(warrantyCoverages.id, coverageId),
        eq(warrantyCoverages.organizationId, organizationId),
        isNull(warrantyCoverages.archivedAt),
      ),
    )
    .limit(1);
  return row ? mapCoverage(row) : null;
}

export async function findIssueById(
  db: DbExecutor,
  organizationId: string,
  issueId: string,
): Promise<WarrantyIssueRecord | null> {
  const [row] = await db
    .select()
    .from(warrantyIssues)
    .where(
      and(
        eq(warrantyIssues.id, issueId),
        eq(warrantyIssues.organizationId, organizationId),
        isNull(warrantyIssues.archivedAt),
      ),
    )
    .limit(1);
  return row ? mapIssue(row) : null;
}

export async function listCoveragesByProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<WarrantyCoverageRecord[]> {
  const rows = await db
    .select()
    .from(warrantyCoverages)
    .where(
      and(
        eq(warrantyCoverages.organizationId, organizationId),
        eq(warrantyCoverages.projectId, projectId),
        isNull(warrantyCoverages.archivedAt),
      ),
    )
    .orderBy(desc(warrantyCoverages.createdAt));
  return rows.map(mapCoverage);
}

export async function listCoveragesForOrg(
  db: DbExecutor,
  organizationId: string,
): Promise<
  readonly {
    readonly coverage: WarrantyCoverageRecord;
    readonly projectName: string;
    readonly projectStatus: string;
  }[]
> {
  const rows = await db
    .select({
      coverage: warrantyCoverages,
      projectName: projects.name,
      projectStatus: projects.status,
    })
    .from(warrantyCoverages)
    .innerJoin(projects, eq(projects.id, warrantyCoverages.projectId))
    .where(
      and(
        eq(warrantyCoverages.organizationId, organizationId),
        isNull(warrantyCoverages.archivedAt),
      ),
    )
    .orderBy(desc(warrantyCoverages.endDate), desc(warrantyCoverages.createdAt));

  return rows.map((row) => ({
    coverage: mapCoverage(row.coverage),
    projectName: row.projectName,
    projectStatus: row.projectStatus,
  }));
}

export async function listIssuesByCoverageIds(
  db: DbExecutor,
  organizationId: string,
  coverageIds: readonly string[],
): Promise<WarrantyIssueRecord[]> {
  if (coverageIds.length === 0) return [];
  const rows = await db
    .select()
    .from(warrantyIssues)
    .where(
      and(
        eq(warrantyIssues.organizationId, organizationId),
        inArray(warrantyIssues.coverageId, [...coverageIds]),
        isNull(warrantyIssues.archivedAt),
      ),
    )
    .orderBy(desc(warrantyIssues.reportedAt));
  return rows.map(mapIssue);
}

export async function insertCoverage(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    workPackageId?: string | null;
    vendorId?: string | null;
    coverageType: WarrantyCoverageType;
    title: string;
    notes?: string | null;
    startDate?: string | null;
    endDate?: string | null;
    status: WarrantyCoverageStatus;
    reminderDaysBefore: number;
    createdByUserId?: string | null;
  },
): Promise<WarrantyCoverageRecord> {
  const [row] = await db
    .insert(warrantyCoverages)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      workPackageId: input.workPackageId ?? null,
      vendorId: input.vendorId ?? null,
      coverageType: input.coverageType,
      title: input.title,
      notes: input.notes ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      status: input.status,
      reminderDaysBefore: input.reminderDaysBefore,
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();
  return mapCoverage(row!);
}

export async function updateCoverageById(
  db: DbExecutor,
  organizationId: string,
  coverageId: string,
  patch: Partial<{
    workPackageId: string | null;
    vendorId: string | null;
    coverageType: WarrantyCoverageType;
    title: string;
    notes: string | null;
    startDate: string | null;
    endDate: string | null;
    status: WarrantyCoverageStatus;
    reminderDaysBefore: number;
    archivedAt: Date | null;
  }>,
): Promise<WarrantyCoverageRecord | null> {
  const [row] = await db
    .update(warrantyCoverages)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(eq(warrantyCoverages.id, coverageId), eq(warrantyCoverages.organizationId, organizationId)),
    )
    .returning();
  return row ? mapCoverage(row) : null;
}

export async function insertIssue(
  db: DbExecutor,
  input: {
    organizationId: string;
    coverageId: string;
    projectId: string;
    title: string;
    notes?: string | null;
    createdByUserId?: string | null;
  },
): Promise<WarrantyIssueRecord> {
  const [row] = await db
    .insert(warrantyIssues)
    .values({
      organizationId: input.organizationId,
      coverageId: input.coverageId,
      projectId: input.projectId,
      title: input.title,
      notes: input.notes ?? null,
      status: 'open',
      createdByUserId: input.createdByUserId ?? null,
    })
    .returning();
  return mapIssue(row!);
}

export async function updateIssueById(
  db: DbExecutor,
  organizationId: string,
  issueId: string,
  patch: Partial<{
    title: string;
    notes: string | null;
    status: WarrantyIssueStatus;
    workOrderId: string | null;
    resolvedAt: Date | null;
  }>,
): Promise<WarrantyIssueRecord | null> {
  const [row] = await db
    .update(warrantyIssues)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(warrantyIssues.id, issueId), eq(warrantyIssues.organizationId, organizationId)))
    .returning();
  return row ? mapIssue(row) : null;
}
