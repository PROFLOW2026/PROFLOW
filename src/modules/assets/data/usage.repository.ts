import { and, desc, eq, isNull } from 'drizzle-orm';
import { equipmentUsageRecords, materialUsageRecords } from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type { EquipmentUsageRecord, MaterialUsageRecord } from '../domain/types';

function asDateString(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapMaterialUsage(row: typeof materialUsageRecords.$inferSelect): MaterialUsageRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    materialId: row.materialId,
    inventoryItemId: row.inventoryItemId,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    usageDate: asDateString(row.usageDate) ?? row.usageDate,
    employeeId: row.employeeId,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapEquipmentUsage(row: typeof equipmentUsageRecords.$inferSelect): EquipmentUsageRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    assetId: row.assetId,
    usageDate: asDateString(row.usageDate) ?? row.usageDate,
    endDate: asDateString(row.endDate),
    hours: row.hours,
    days: row.days,
    mileage: row.mileage,
    employeeId: row.employeeId,
    notes: row.notes,
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertMaterialUsage(
  db: DbExecutor,
  values: typeof materialUsageRecords.$inferInsert,
): Promise<MaterialUsageRecord> {
  const [row] = await db.insert(materialUsageRecords).values(values).returning();
  if (!row) throw new Error('Failed to insert material usage record');
  return mapMaterialUsage(row);
}

export async function insertEquipmentUsage(
  db: DbExecutor,
  values: typeof equipmentUsageRecords.$inferInsert,
): Promise<EquipmentUsageRecord> {
  const [row] = await db.insert(equipmentUsageRecords).values(values).returning();
  if (!row) throw new Error('Failed to insert equipment usage record');
  return mapEquipmentUsage(row);
}

export async function findMaterialUsageById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<MaterialUsageRecord | null> {
  const [row] = await db
    .select()
    .from(materialUsageRecords)
    .where(
      and(eq(materialUsageRecords.id, id), eq(materialUsageRecords.organizationId, organizationId)),
    )
    .limit(1);
  return row ? mapMaterialUsage(row) : null;
}

export async function findEquipmentUsageById(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<EquipmentUsageRecord | null> {
  const [row] = await db
    .select()
    .from(equipmentUsageRecords)
    .where(
      and(
        eq(equipmentUsageRecords.id, id),
        eq(equipmentUsageRecords.organizationId, organizationId),
      ),
    )
    .limit(1);
  return row ? mapEquipmentUsage(row) : null;
}

export async function listMaterialUsageForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<MaterialUsageRecord[]> {
  const rows = await db
    .select()
    .from(materialUsageRecords)
    .where(
      and(
        eq(materialUsageRecords.organizationId, organizationId),
        eq(materialUsageRecords.projectId, projectId),
        isNull(materialUsageRecords.archivedAt),
      ),
    )
    .orderBy(desc(materialUsageRecords.usageDate), desc(materialUsageRecords.createdAt))
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));
  return rows.map(mapMaterialUsage);
}

export async function listEquipmentUsageForProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<EquipmentUsageRecord[]> {
  const rows = await db
    .select()
    .from(equipmentUsageRecords)
    .where(
      and(
        eq(equipmentUsageRecords.organizationId, organizationId),
        eq(equipmentUsageRecords.projectId, projectId),
        isNull(equipmentUsageRecords.archivedAt),
      ),
    )
    .orderBy(desc(equipmentUsageRecords.usageDate), desc(equipmentUsageRecords.createdAt))
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));
  return rows.map(mapEquipmentUsage);
}

export async function listEquipmentUsageForAsset(
  db: DbExecutor,
  organizationId: string,
  assetId: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<EquipmentUsageRecord[]> {
  const rows = await db
    .select()
    .from(equipmentUsageRecords)
    .where(
      and(
        eq(equipmentUsageRecords.organizationId, organizationId),
        eq(equipmentUsageRecords.assetId, assetId),
        isNull(equipmentUsageRecords.archivedAt),
      ),
    )
    .orderBy(desc(equipmentUsageRecords.usageDate), desc(equipmentUsageRecords.createdAt))
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));
  return rows.map(mapEquipmentUsage);
}

export async function listMaterialUsageForInventoryItem(
  db: DbExecutor,
  organizationId: string,
  inventoryItemId: string,
  options: { readonly limit?: number; readonly offset?: number } = {},
): Promise<MaterialUsageRecord[]> {
  const rows = await db
    .select()
    .from(materialUsageRecords)
    .where(
      and(
        eq(materialUsageRecords.organizationId, organizationId),
        eq(materialUsageRecords.inventoryItemId, inventoryItemId),
        isNull(materialUsageRecords.archivedAt),
      ),
    )
    .orderBy(desc(materialUsageRecords.usageDate), desc(materialUsageRecords.createdAt))
    .limit(
      resolveListLimit(options.limit, {
        hardCap:
          options.limit != null && options.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(options.offset));
  return rows.map(mapMaterialUsage);
}

export async function archiveMaterialUsageById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  archivedAt: Date,
): Promise<MaterialUsageRecord | null> {
  const [row] = await db
    .update(materialUsageRecords)
    .set({ archivedAt, updatedAt: new Date() })
    .where(
      and(eq(materialUsageRecords.id, id), eq(materialUsageRecords.organizationId, organizationId)),
    )
    .returning();
  return row ? mapMaterialUsage(row) : null;
}

export async function archiveEquipmentUsageById(
  db: DbExecutor,
  organizationId: string,
  id: string,
  archivedAt: Date,
): Promise<EquipmentUsageRecord | null> {
  const [row] = await db
    .update(equipmentUsageRecords)
    .set({ archivedAt, updatedAt: new Date() })
    .where(
      and(
        eq(equipmentUsageRecords.id, id),
        eq(equipmentUsageRecords.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapEquipmentUsage(row) : null;
}
