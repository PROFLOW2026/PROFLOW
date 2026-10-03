import { and, asc, eq, inArray, isNull } from 'drizzle-orm';
import {
  projectLocations,
  subcontractWorkLineAdjustments,
  subcontractWorkLineAttributes,
  subcontractWorkLinePrices,
  subcontractWorkLines,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { SubcontractLineType, WorkLineOperationalView } from '../domain/types';

/** Operational: no price columns. */
export async function listWorkLinesOperational(
  db: DbExecutor,
  organizationId: string,
  agreementId: string,
): Promise<WorkLineOperationalView[]> {
  const rows = await db
    .select({
      id: subcontractWorkLines.id,
      agreementId: subcontractWorkLines.agreementId,
      code: subcontractWorkLines.code,
      description: subcontractWorkLines.description,
      unit: subcontractWorkLines.unit,
      quantity: subcontractWorkLines.quantity,
      lineType: subcontractWorkLineAttributes.lineType,
      weightPercent: subcontractWorkLineAttributes.weightPercent,
      plannedStart: subcontractWorkLineAttributes.plannedStart,
      plannedEnd: subcontractWorkLineAttributes.plannedEnd,
      locationId: subcontractWorkLines.locationId,
      workPackageId: subcontractWorkLines.workPackageId,
      sortOrder: subcontractWorkLines.sortOrder,
      status: subcontractWorkLines.status,
      isBaseline: subcontractWorkLineAttributes.isBaseline,
      originChangeId: subcontractWorkLineAttributes.originChangeId,
      notes: subcontractWorkLineAttributes.notes,
    })
    .from(subcontractWorkLines)
    .leftJoin(
      subcontractWorkLineAttributes,
      and(
        eq(subcontractWorkLineAttributes.workLineId, subcontractWorkLines.id),
        eq(subcontractWorkLineAttributes.organizationId, subcontractWorkLines.organizationId),
      ),
    )
    .where(
      and(
        eq(subcontractWorkLines.organizationId, organizationId),
        eq(subcontractWorkLines.agreementId, agreementId),
        isNull(subcontractWorkLines.archivedAt),
      ),
    )
    .orderBy(asc(subcontractWorkLines.sortOrder), asc(subcontractWorkLines.createdAt))
    .limit(2000);
  return rows.map((row) => ({
    ...row,
    lineType: (row.lineType ?? 'quantity_rate') as SubcontractLineType,
    isBaseline: row.isBaseline ?? true,
    originChangeId: row.originChangeId ?? null,
    weightPercent: row.weightPercent ?? null,
    plannedStart: row.plannedStart ?? null,
    plannedEnd: row.plannedEnd ?? null,
    notes: row.notes ?? null,
  }));
}

export async function findWorkLine(db: DbExecutor, organizationId: string, workLineId: string) {
  const [row] = await db
    .select({
      id: subcontractWorkLines.id,
      agreementId: subcontractWorkLines.agreementId,
      projectId: subcontractWorkLines.projectId,
      vendorId: subcontractWorkLines.vendorId,
      archivedAt: subcontractWorkLines.archivedAt,
      lineType: subcontractWorkLineAttributes.lineType,
      quantity: subcontractWorkLines.quantity,
    })
    .from(subcontractWorkLines)
    .leftJoin(
      subcontractWorkLineAttributes,
      and(
        eq(subcontractWorkLineAttributes.workLineId, subcontractWorkLines.id),
        eq(subcontractWorkLineAttributes.organizationId, subcontractWorkLines.organizationId),
      ),
    )
    .where(and(eq(subcontractWorkLines.organizationId, organizationId), eq(subcontractWorkLines.id, workLineId)))
    .limit(1);
  return row ?? null;
}

/** FINANCIAL: price rows for the agreement's lines. */
export async function listWorkLinePrices(db: DbExecutor, organizationId: string, agreementId: string) {
  return db
    .select({
      workLineId: subcontractWorkLinePrices.workLineId,
      currency: subcontractWorkLinePrices.currency,
      unitPrice: subcontractWorkLinePrices.unitPrice,
      contractAmount: subcontractWorkLinePrices.contractAmount,
    })
    .from(subcontractWorkLinePrices)
    .innerJoin(
      subcontractWorkLines,
      and(
        eq(subcontractWorkLines.id, subcontractWorkLinePrices.workLineId),
        eq(subcontractWorkLines.organizationId, subcontractWorkLinePrices.organizationId),
      ),
    )
    .where(
      and(
        eq(subcontractWorkLinePrices.organizationId, organizationId),
        eq(subcontractWorkLines.agreementId, agreementId),
        isNull(subcontractWorkLines.archivedAt),
      ),
    );
}

/** FINANCIAL: applied adjustments ledger. */
export async function listWorkLineAdjustments(db: DbExecutor, organizationId: string, agreementId: string) {
  return db
    .select({
      id: subcontractWorkLineAdjustments.id,
      workLineId: subcontractWorkLineAdjustments.workLineId,
      changeId: subcontractWorkLineAdjustments.changeId,
      quantityDelta: subcontractWorkLineAdjustments.quantityDelta,
      amountDelta: subcontractWorkLineAdjustments.amountDelta,
      unitRate: subcontractWorkLineAdjustments.unitRate,
      currency: subcontractWorkLineAdjustments.currency,
      createdAt: subcontractWorkLineAdjustments.createdAt,
    })
    .from(subcontractWorkLineAdjustments)
    .where(
      and(
        eq(subcontractWorkLineAdjustments.organizationId, organizationId),
        eq(subcontractWorkLineAdjustments.agreementId, agreementId),
      ),
    )
    .orderBy(asc(subcontractWorkLineAdjustments.createdAt));
}

export async function insertWorkLine(
  db: DbExecutor,
  line: typeof subcontractWorkLines.$inferInsert,
  attributes: Omit<typeof subcontractWorkLineAttributes.$inferInsert, 'workLineId'>,
  price: Omit<typeof subcontractWorkLinePrices.$inferInsert, 'workLineId'> | null,
): Promise<string> {
  const [row] = await db.insert(subcontractWorkLines).values(line).returning({ id: subcontractWorkLines.id });
  const workLineId = row!.id;
  await db.insert(subcontractWorkLineAttributes).values({ ...attributes, workLineId });
  if (price) await db.insert(subcontractWorkLinePrices).values({ ...price, workLineId });
  return workLineId;
}

export async function updateWorkLineRow(
  db: DbExecutor,
  organizationId: string,
  workLineId: string,
  patch: Partial<typeof subcontractWorkLines.$inferInsert>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db
    .update(subcontractWorkLines)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(subcontractWorkLines.organizationId, organizationId), eq(subcontractWorkLines.id, workLineId)));
}

export async function updateWorkLineAttributes(
  db: DbExecutor,
  organizationId: string,
  workLineId: string,
  patch: Partial<typeof subcontractWorkLineAttributes.$inferInsert>,
): Promise<void> {
  if (Object.keys(patch).length === 0) return;
  await db
    .update(subcontractWorkLineAttributes)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(subcontractWorkLineAttributes.organizationId, organizationId),
        eq(subcontractWorkLineAttributes.workLineId, workLineId),
      ),
    );
}

export async function upsertWorkLinePrice(
  db: DbExecutor,
  values: typeof subcontractWorkLinePrices.$inferInsert,
): Promise<void> {
  await db
    .insert(subcontractWorkLinePrices)
    .values(values)
    .onConflictDoUpdate({
      target: subcontractWorkLinePrices.workLineId,
      set: { unitPrice: values.unitPrice, contractAmount: values.contractAmount, updatedAt: new Date() },
    });
}

export async function insertWorkLineAdjustments(
  db: DbExecutor,
  rows: readonly (typeof subcontractWorkLineAdjustments.$inferInsert)[],
): Promise<void> {
  if (rows.length === 0) return;
  await db.insert(subcontractWorkLineAdjustments).values([...rows]);
}

export async function findLocationInProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  locationId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: projectLocations.id })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
        eq(projectLocations.id, locationId),
      ),
    )
    .limit(1);
  return Boolean(row);
}

export async function listProjectLocationOptions(db: DbExecutor, organizationId: string, projectId: string) {
  return db
    .select({ id: projectLocations.id, name: projectLocations.name, code: projectLocations.code })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
        eq(projectLocations.isActive, true),
        isNull(projectLocations.archivedAt),
      ),
    )
    .orderBy(asc(projectLocations.sortOrder), asc(projectLocations.name))
    .limit(500);
}

export async function countActiveLines(
  db: DbExecutor,
  organizationId: string,
  workLineIds: readonly string[],
  agreementId: string,
): Promise<number> {
  if (workLineIds.length === 0) return 0;
  const rows = await db
    .select({ id: subcontractWorkLines.id })
    .from(subcontractWorkLines)
    .where(
      and(
        eq(subcontractWorkLines.organizationId, organizationId),
        eq(subcontractWorkLines.agreementId, agreementId),
        inArray(subcontractWorkLines.id, [...workLineIds]),
        isNull(subcontractWorkLines.archivedAt),
      ),
    );
  return rows.length;
}
