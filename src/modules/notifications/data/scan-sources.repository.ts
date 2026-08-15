import { and, eq, isNull, lt, lte, sql } from 'drizzle-orm';
import {
  boqProgressBatches,
  documents,
  employees,
  inventoryItems,
  planningWorkItems,
  projectServiceDetails,
  projects,
  safetyCorrectiveActions,
  timesheets,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { BusinessDate } from '@/shared/dates';

export const SCAN_SOURCE_CAP = 15;
const DOCUMENT_EXPIRY_HORIZON_DAYS = 30;

function isMissingRelation(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = 'code' in error ? String((error as { code?: unknown }).code) : '';
  const message = error instanceof Error ? error.message : String(error);
  return code === '42P01' || /relation .+ does not exist/i.test(message);
}

export interface ScanEntity {
  readonly id: string;
  readonly reference: string | null;
  readonly extra: string | null;
  readonly deepLink: string;
  readonly projectId?: string | null;
  readonly recipientUserId?: string | null;
}

export async function listSubmittedTimesheets(
  db: DbExecutor,
  organizationId: string,
  cap: number,
): Promise<ScanEntity[]> {
  const rows = await db
    .select({
      id: timesheets.id,
      periodStart: timesheets.periodStart,
      periodEnd: timesheets.periodEnd,
    })
    .from(timesheets)
    .where(
      and(
        eq(timesheets.organizationId, organizationId),
        eq(timesheets.status, 'submitted'),
        isNull(timesheets.archivedAt),
      ),
    )
    .limit(cap);

  return rows.map((row) => ({
    id: row.id,
    reference: null,
    extra: `${row.periodStart} – ${row.periodEnd}`,
    deepLink: '/workforce/time/approvals',
  }));
}

export async function listExpiringDocuments(
  db: DbExecutor,
  organizationId: string,
  today: BusinessDate,
  cap: number,
): Promise<ScanEntity[]> {
  const [year, month, day] = today.split('-').map(Number) as [number, number, number];
  const horizonDate = new Date(Date.UTC(year, month - 1, day + DOCUMENT_EXPIRY_HORIZON_DAYS));
  const horizon = horizonDate.toISOString().slice(0, 10);

  const rows = await db
    .select({
      id: documents.id,
      originalFilename: documents.originalFilename,
      expiresAt: documents.expiresAt,
    })
    .from(documents)
    .where(
      and(
        eq(documents.organizationId, organizationId),
        eq(documents.status, 'available'),
        isNull(documents.deletedAt),
        sql`${documents.expiresAt} is not null`,
        lte(documents.expiresAt, horizon),
      ),
    )
    .limit(cap);

  return rows.map((row) => ({
    id: row.id,
    reference: row.originalFilename,
    extra: row.expiresAt,
    deepLink: '/documents',
  }));
}

export async function listOverduePlanningTasks(
  db: DbExecutor,
  organizationId: string,
  today: BusinessDate,
  cap: number,
): Promise<ScanEntity[]> {
  const rows = await db
    .select({
      id: planningWorkItems.id,
      name: planningWorkItems.name,
      projectId: planningWorkItems.projectId,
      targetEndDate: planningWorkItems.targetEndDate,
    })
    .from(planningWorkItems)
    .where(
      and(
        eq(planningWorkItems.organizationId, organizationId),
        isNull(planningWorkItems.archivedAt),
        isNull(planningWorkItems.actualEndDate),
        lt(planningWorkItems.targetEndDate, today),
        sql`(${planningWorkItems.progressPercent})::numeric < 100`,
      ),
    )
    .limit(cap);

  return rows.map((row) => ({
    id: row.id,
    reference: row.name,
    extra: row.targetEndDate,
    deepLink: `/projects/${row.projectId}`,
    projectId: row.projectId,
  }));
}

export async function listPendingBoqProgressBatches(
  db: DbExecutor,
  organizationId: string,
  cap: number,
): Promise<ScanEntity[]> {
  const rows = await db
    .select({
      id: boqProgressBatches.id,
      projectId: boqProgressBatches.projectId,
      periodLabel: boqProgressBatches.periodLabel,
      certificateNumber: boqProgressBatches.certificateNumber,
    })
    .from(boqProgressBatches)
    .where(
      and(
        eq(boqProgressBatches.organizationId, organizationId),
        eq(boqProgressBatches.status, 'draft'),
        isNull(boqProgressBatches.archivedAt),
      ),
    )
    .limit(cap);

  return rows.map((row) => ({
    id: row.id,
    reference: null,
    extra: `${row.periodLabel} · #${row.certificateNumber}`,
    deepLink: `/projects/${row.projectId}?tab=boq`,
    projectId: row.projectId,
  }));
}

export async function listAssignedWorkOrders(
  db: DbExecutor,
  organizationId: string,
  cap: number,
): Promise<ScanEntity[]> {
  const rows = await db
    .select({
      id: projectServiceDetails.projectId,
      name: projects.name,
      assigneeUserId: employees.userId,
    })
    .from(projectServiceDetails)
    .innerJoin(
      projects,
      and(
        eq(projects.id, projectServiceDetails.projectId),
        eq(projects.organizationId, projectServiceDetails.organizationId),
      ),
    )
    .leftJoin(
      employees,
      and(
        eq(employees.id, projectServiceDetails.assigneeEmployeeId),
        eq(employees.organizationId, projectServiceDetails.organizationId),
      ),
    )
    .where(
      and(
        eq(projectServiceDetails.organizationId, organizationId),
        sql`${projectServiceDetails.assigneeEmployeeId} is not null`,
        sql`${projectServiceDetails.serviceStatus} not in ('completed', 'cancelled')`,
      ),
    )
    .limit(cap);

  return rows
    .filter((row) => row.assigneeUserId)
    .map((row) => ({
      id: row.id,
      reference: row.name,
      extra: null,
      deepLink: `/work-orders/${row.id}`,
      recipientUserId: row.assigneeUserId,
    }));
}

export async function listClosedAssignedWorkOrderIds(
  db: DbExecutor,
  organizationId: string,
  cap: number,
): Promise<string[]> {
  const rows = await db
    .select({ id: projectServiceDetails.projectId })
    .from(projectServiceDetails)
    .where(
      and(
        eq(projectServiceDetails.organizationId, organizationId),
        sql`${projectServiceDetails.assigneeEmployeeId} is not null`,
        sql`${projectServiceDetails.serviceStatus} in ('completed', 'cancelled')`,
      ),
    )
    .limit(cap);

  return rows.map((row) => row.id);
}

export async function listLowStockItems(
  db: DbExecutor,
  organizationId: string,
  cap: number,
): Promise<ScanEntity[]> {
  try {
    const rows = await db
      .select({
        id: inventoryItems.id,
        name: inventoryItems.name,
        quantityOnHand: inventoryItems.quantityOnHand,
      })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.organizationId, organizationId),
          isNull(inventoryItems.archivedAt),
          sql`coalesce(${inventoryItems.minStockLevel}, ${inventoryItems.reorderLevel}) is not null`,
          sql`(${inventoryItems.quantityOnHand})::numeric <= coalesce(
            (${inventoryItems.minStockLevel})::numeric,
            (${inventoryItems.reorderLevel})::numeric
          )`,
        ),
      )
      .limit(cap);

    return rows.map((row) => ({
      id: row.id,
      reference: row.name,
      extra: `qty ${row.quantityOnHand}`,
      deepLink: '/assets/inventory',
    }));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}

export async function listOverdueSafetyActions(
  db: DbExecutor,
  organizationId: string,
  today: BusinessDate,
  cap: number,
): Promise<ScanEntity[]> {
  try {
    const rows = await db
      .select({
        id: safetyCorrectiveActions.id,
        title: safetyCorrectiveActions.title,
        dueDate: safetyCorrectiveActions.dueDate,
      })
      .from(safetyCorrectiveActions)
      .where(
        and(
          eq(safetyCorrectiveActions.organizationId, organizationId),
          sql`${safetyCorrectiveActions.status} in ('open', 'in_progress')`,
          sql`${safetyCorrectiveActions.dueDate} is not null`,
          lt(safetyCorrectiveActions.dueDate, today),
        ),
      )
      .limit(cap);

    return rows.map((row) => ({
      id: row.id,
      reference: row.title,
      extra: row.dueDate,
      deepLink: '/safety',
    }));
  } catch (error) {
    if (isMissingRelation(error)) return [];
    throw error;
  }
}
