import { and, asc, eq, isNull } from 'drizzle-orm';
import { customFieldDefinitions, customFieldValues } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  CustomFieldDefinitionRecord,
  CustomFieldEntityType,
  CustomFieldType,
  CustomFieldValueRecord,
} from '../domain/types';

function asDateString(value: string | Date | null): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

function mapDefinition(row: typeof customFieldDefinitions.$inferSelect): CustomFieldDefinitionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    entityType: row.entityType as CustomFieldEntityType,
    key: row.key,
    label: row.label,
    fieldType: row.fieldType as CustomFieldType,
    config: (row.config ?? {}) as Record<string, unknown>,
    required: row.required,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapValue(row: typeof customFieldValues.$inferSelect): CustomFieldValueRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    definitionId: row.definitionId,
    entityId: row.entityId,
    valueText: row.valueText,
    valueNumber: row.valueNumber,
    valueBool: row.valueBool,
    valueDate: asDateString(row.valueDate),
    valueJson: row.valueJson,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertDefinition(
  db: DbExecutor,
  input: {
    organizationId: string;
    entityType: CustomFieldEntityType;
    key: string;
    label: string;
    fieldType: CustomFieldType;
    config?: Record<string, unknown>;
    required?: boolean;
    sortOrder?: number;
  },
): Promise<CustomFieldDefinitionRecord> {
  const [row] = await db
    .insert(customFieldDefinitions)
    .values({
      organizationId: input.organizationId,
      entityType: input.entityType,
      key: input.key,
      label: input.label,
      fieldType: input.fieldType,
      config: input.config ?? {},
      required: input.required ?? false,
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();

  return mapDefinition(row!);
}

export async function findDefinitionById(
  db: DbExecutor,
  organizationId: string,
  definitionId: string,
): Promise<CustomFieldDefinitionRecord | null> {
  const [row] = await db
    .select()
    .from(customFieldDefinitions)
    .where(
      and(
        eq(customFieldDefinitions.id, definitionId),
        eq(customFieldDefinitions.organizationId, organizationId),
      ),
    )
    .limit(1);

  return row ? mapDefinition(row) : null;
}

export async function listDefinitions(
  db: DbExecutor,
  organizationId: string,
  entityType?: CustomFieldEntityType,
  includeArchived = false,
): Promise<CustomFieldDefinitionRecord[]> {
  const conditions = [eq(customFieldDefinitions.organizationId, organizationId)];
  if (!includeArchived) conditions.push(isNull(customFieldDefinitions.archivedAt));
  if (entityType) conditions.push(eq(customFieldDefinitions.entityType, entityType));

  const rows = await db
    .select()
    .from(customFieldDefinitions)
    .where(and(...conditions))
    .orderBy(asc(customFieldDefinitions.sortOrder), asc(customFieldDefinitions.label));

  return rows.map(mapDefinition);
}

export async function archiveDefinition(
  db: DbExecutor,
  organizationId: string,
  definitionId: string,
): Promise<CustomFieldDefinitionRecord | null> {
  const [row] = await db
    .update(customFieldDefinitions)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(customFieldDefinitions.id, definitionId),
        eq(customFieldDefinitions.organizationId, organizationId),
        isNull(customFieldDefinitions.archivedAt),
      ),
    )
    .returning();

  return row ? mapDefinition(row) : null;
}

export async function upsertValue(
  db: DbExecutor,
  input: {
    organizationId: string;
    definitionId: string;
    entityId: string;
    valueText?: string | null;
    valueNumber?: string | null;
    valueBool?: boolean | null;
    valueDate?: string | null;
    valueJson?: unknown;
  },
): Promise<CustomFieldValueRecord> {
  const [row] = await db
    .insert(customFieldValues)
    .values({
      organizationId: input.organizationId,
      definitionId: input.definitionId,
      entityId: input.entityId,
      valueText: input.valueText ?? null,
      valueNumber: input.valueNumber ?? null,
      valueBool: input.valueBool ?? null,
      valueDate: input.valueDate ?? null,
      valueJson: input.valueJson ?? null,
    })
    .onConflictDoUpdate({
      target: [customFieldValues.definitionId, customFieldValues.entityId],
      set: {
        valueText: input.valueText ?? null,
        valueNumber: input.valueNumber ?? null,
        valueBool: input.valueBool ?? null,
        valueDate: input.valueDate ?? null,
        valueJson: input.valueJson ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return mapValue(row!);
}

export async function listValuesForEntity(
  db: DbExecutor,
  organizationId: string,
  entityId: string,
): Promise<CustomFieldValueRecord[]> {
  const rows = await db
    .select()
    .from(customFieldValues)
    .where(
      and(
        eq(customFieldValues.organizationId, organizationId),
        eq(customFieldValues.entityId, entityId),
      ),
    );

  return rows.map(mapValue);
}
