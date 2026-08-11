/**
 * Material / equipment usage application.
 * Operational attribution only — never Expense, GL, or Actual.
 * Purchase Actual stays on Expense / AP paths once; usage does not double-count.
 */
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import {
  assertAnyPermission,
  assertPermission,
  hasAnyPermission,
  hasPermission,
} from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findProjectById } from '@/modules/projects';
import { findMaterialItemById } from '@/modules/procurement';
import { findEmployeeById } from '@/modules/workforce';
import { findAssetById, findInventoryItemById } from '../data/assets.repository';
import {
  archiveEquipmentUsageById,
  archiveMaterialUsageById,
  findEquipmentUsageById,
  findMaterialUsageById,
  insertEquipmentUsage,
  insertMaterialUsage,
  listEquipmentUsageForAsset,
  listEquipmentUsageForProject,
  listMaterialUsageForInventoryItem,
  listMaterialUsageForProject,
} from '../data/usage.repository';
import { normalizeQuantity } from '../domain/inventory';
import {
  assertUsageDateRange,
  doesUsageCreatePurchaseActual,
  isEquipmentUsageRecognizedActual,
  isMaterialUsageRecognizedActual,
} from '../domain/usage';
import type { EquipmentUsageRecord, MaterialUsageRecord } from '../domain/types';
import {
  archiveEquipmentUsageSchema,
  archiveMaterialUsageSchema,
  recordEquipmentUsageSchema,
  recordMaterialUsageSchema,
  type ArchiveEquipmentUsageInput,
  type ArchiveMaterialUsageInput,
  type RecordEquipmentUsageInput,
  type RecordMaterialUsageInput,
} from '../validation/schemas';

function parseOrThrow<T>(
  schema: {
    safeParse: (
      input: unknown,
    ) =>
      | { success: true; data: T }
      | { success: false; error: { issues: readonly { path: PropertyKey[]; message: string }[] } };
  },
  raw: unknown,
): T {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return parsed.data;
}

function canReadMaterialUsage(context: OrgContext): boolean {
  return hasAnyPermission(context, [PERMISSIONS.MATERIALS_READ, PERMISSIONS.ASSETS_READ]);
}

function canManageMaterialUsage(context: OrgContext): boolean {
  return hasAnyPermission(context, [PERMISSIONS.MATERIALS_MANAGE, PERMISSIONS.ASSETS_MANAGE]);
}

async function requireProject(context: OrgContext, projectId: string) {
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project || project.archivedAt) throw new NotFoundError('Project');
  return project;
}

async function requireOptionalEmployee(context: OrgContext, employeeId: string | null | undefined) {
  if (!employeeId) return;
  const employee = await findEmployeeById(context.db, context.organizationId, employeeId);
  if (!employee || employee.archivedAt) throw new NotFoundError('Employee');
}

/**
 * List material usage for a project / job / work order (same projects row).
 */
export async function listMaterialUsageForProjectId(
  context: OrgContext,
  projectId: string,
): Promise<MaterialUsageRecord[]> {
  if (!canReadMaterialUsage(context)) {
    assertAnyPermission(context, [PERMISSIONS.MATERIALS_READ, PERMISSIONS.ASSETS_READ]);
  }
  await requireProject(context, projectId);
  return listMaterialUsageForProject(context.db, context.organizationId, projectId);
}

export async function listEquipmentUsageForProjectId(
  context: OrgContext,
  projectId: string,
): Promise<EquipmentUsageRecord[]> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  await requireProject(context, projectId);
  return listEquipmentUsageForProject(context.db, context.organizationId, projectId);
}

export async function listEquipmentUsageForAssetId(
  context: OrgContext,
  assetId: string,
): Promise<EquipmentUsageRecord[]> {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const asset = await findAssetById(context.db, context.organizationId, assetId);
  if (!asset || asset.archivedAt) throw new NotFoundError('Asset');
  return listEquipmentUsageForAsset(context.db, context.organizationId, assetId);
}

export async function listMaterialUsageForInventoryItemId(
  context: OrgContext,
  inventoryItemId: string,
): Promise<MaterialUsageRecord[]> {
  if (!canReadMaterialUsage(context)) {
    assertAnyPermission(context, [PERMISSIONS.MATERIALS_READ, PERMISSIONS.ASSETS_READ]);
  }
  const item = await findInventoryItemById(context.db, context.organizationId, inventoryItemId);
  if (!item || item.archivedAt) throw new NotFoundError('Inventory item');
  return listMaterialUsageForInventoryItem(context.db, context.organizationId, inventoryItemId);
}

/**
 * Record material consumption against a project/job/WO.
 * Does not create Actual; does not auto-issue inventory quantity.
 */
export async function recordMaterialUsage(context: OrgContext, raw: RecordMaterialUsageInput) {
  if (!canManageMaterialUsage(context)) {
    assertAnyPermission(context, [PERMISSIONS.MATERIALS_MANAGE, PERMISSIONS.ASSETS_MANAGE]);
  }
  const input = parseOrThrow(recordMaterialUsageSchema, raw);
  await requireProject(context, input.projectId);
  await requireOptionalEmployee(context, input.employeeId);

  let unit = input.unit ?? null;
  let description = input.description;

  if (input.materialId) {
    const material = await findMaterialItemById(
      context.db,
      context.organizationId,
      input.materialId,
    );
    if (!material || material.archivedAt) throw new NotFoundError('Material item');
    unit = unit ?? material.unit;
    if (!description.trim()) description = material.name;
  }

  if (input.inventoryItemId) {
    const item = await findInventoryItemById(
      context.db,
      context.organizationId,
      input.inventoryItemId,
    );
    if (!item || item.archivedAt) throw new NotFoundError('Inventory item');
    unit = unit ?? item.unit;
    if (!description.trim()) description = item.name;
  }

  // Hard financial invariant — usage never becomes Actual.
  void isMaterialUsageRecognizedActual();
  void doesUsageCreatePurchaseActual();

  const record = await insertMaterialUsage(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    materialId: input.materialId ?? null,
    inventoryItemId: input.inventoryItemId ?? null,
    description,
    quantity: normalizeQuantity(input.quantity),
    unit,
    usageDate: input.usageDate,
    employeeId: input.employeeId ?? null,
    notes: input.notes ?? null,
    createdByUserId: context.userId,
  });

  if (hasPermission(context, PERMISSIONS.MATERIALS_MANAGE)) {
    await noteModuleUsage(context.db, context.organizationId, 'materials');
  }
  if (hasPermission(context, PERMISSIONS.ASSETS_MANAGE) && input.inventoryItemId) {
    await noteModuleUsage(context.db, context.organizationId, 'assets');
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MATERIAL_USAGE_RECORDED,
    entityType: 'material_usage_record',
    entityId: record.id,
    after: {
      id: record.id,
      projectId: record.projectId,
      materialId: record.materialId,
      inventoryItemId: record.inventoryItemId,
      quantity: record.quantity,
      usageDate: record.usageDate,
      recognizedActual: false,
      createsPurchaseActual: false,
      autoIssuedInventory: false,
    },
  });

  return record;
}

/**
 * Record equipment / vehicle usage on a project/job/WO.
 * Does not create Actual; assignment / hours / mileage are operational only.
 */
export async function recordEquipmentUsage(context: OrgContext, raw: RecordEquipmentUsageInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(recordEquipmentUsageSchema, raw);
  await requireProject(context, input.projectId);
  await requireOptionalEmployee(context, input.employeeId);

  const asset = await findAssetById(context.db, context.organizationId, input.assetId);
  if (!asset || asset.archivedAt) throw new NotFoundError('Asset');

  try {
    assertUsageDateRange(input.usageDate, input.endDate ?? null);
  } catch (error) {
    throw new DomainRuleError(
      error instanceof Error ? error.message : 'Invalid usage date range',
      'assets.errors.invalidUsageDateRange',
    );
  }

  void isEquipmentUsageRecognizedActual();
  void doesUsageCreatePurchaseActual();

  const record = await insertEquipmentUsage(context.db, {
    organizationId: context.organizationId,
    projectId: input.projectId,
    assetId: input.assetId,
    usageDate: input.usageDate,
    endDate: input.endDate ?? null,
    hours: input.hours ? normalizeQuantity(input.hours) : null,
    days: input.days ? normalizeQuantity(input.days) : null,
    mileage: input.mileage ? normalizeQuantity(input.mileage) : null,
    employeeId: input.employeeId ?? null,
    notes: input.notes ?? null,
    createdByUserId: context.userId,
  });

  await noteModuleUsage(context.db, context.organizationId, 'assets');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EQUIPMENT_USAGE_RECORDED,
    entityType: 'equipment_usage_record',
    entityId: record.id,
    after: {
      id: record.id,
      projectId: record.projectId,
      assetId: record.assetId,
      usageDate: record.usageDate,
      endDate: record.endDate,
      hours: record.hours,
      days: record.days,
      mileage: record.mileage,
      recognizedActual: false,
      createsPurchaseActual: false,
    },
  });

  return record;
}

export async function archiveMaterialUsage(context: OrgContext, raw: ArchiveMaterialUsageInput) {
  if (!canManageMaterialUsage(context)) {
    assertAnyPermission(context, [PERMISSIONS.MATERIALS_MANAGE, PERMISSIONS.ASSETS_MANAGE]);
  }
  const input = parseOrThrow(archiveMaterialUsageSchema, raw);
  const existing = await findMaterialUsageById(
    context.db,
    context.organizationId,
    input.materialUsageId,
  );
  if (!existing || existing.archivedAt) throw new NotFoundError('Material usage');

  const archived = await archiveMaterialUsageById(
    context.db,
    context.organizationId,
    input.materialUsageId,
    new Date(),
  );
  if (!archived) throw new NotFoundError('Material usage');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MATERIAL_USAGE_ARCHIVED,
    entityType: 'material_usage_record',
    entityId: archived.id,
    before: { archivedAt: null },
    after: { archivedAt: archived.archivedAt?.toISOString() ?? null, recognizedActual: false },
  });

  return archived;
}

export async function archiveEquipmentUsage(context: OrgContext, raw: ArchiveEquipmentUsageInput) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const input = parseOrThrow(archiveEquipmentUsageSchema, raw);
  const existing = await findEquipmentUsageById(
    context.db,
    context.organizationId,
    input.equipmentUsageId,
  );
  if (!existing || existing.archivedAt) throw new NotFoundError('Equipment usage');

  const archived = await archiveEquipmentUsageById(
    context.db,
    context.organizationId,
    input.equipmentUsageId,
    new Date(),
  );
  if (!archived) throw new NotFoundError('Equipment usage');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EQUIPMENT_USAGE_ARCHIVED,
    entityType: 'equipment_usage_record',
    entityId: archived.id,
    before: { archivedAt: null },
    after: { archivedAt: archived.archivedAt?.toISOString() ?? null, recognizedActual: false },
  });

  return archived;
}
