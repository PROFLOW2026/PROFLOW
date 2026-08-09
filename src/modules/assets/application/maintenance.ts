import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { findVendorById } from '@/modules/vendors/data/vendors.repository';
import { isMaintenanceCostAnExpense } from '../domain/inventory';
import {
  findAssetById,
  insertMaintenanceRecord,
  listMaintenanceForAsset,
} from '../data/assets.repository';
import {
  createMaintenanceRecordSchema,
  type CreateMaintenanceRecordInput,
} from '../validation/schemas';

export async function listMaintenanceRecordsForAsset(context: OrgContext, assetId: string) {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const asset = await findAssetById(context.db, context.organizationId, assetId);
  if (!asset) throw new NotFoundError('Asset');
  return listMaintenanceForAsset(context.db, context.organizationId, assetId);
}

/**
 * Creates a maintenance record. costAmount is operational metadata only —
 * this never posts an Expense (isMaintenanceCostAnExpense() === false).
 */
export async function createMaintenanceRecord(
  context: OrgContext,
  raw: CreateMaintenanceRecordInput,
) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const parsed = createMaintenanceRecordSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const asset = await findAssetById(context.db, context.organizationId, input.assetId);
  if (!asset) throw new NotFoundError('Asset');

  if (input.vendorId) {
    const vendor = await findVendorById(context.db, context.organizationId, input.vendorId);
    if (!vendor || vendor.archivedAt) throw new NotFoundError('Vendor');
  }

  // Hard rule: maintenance cost is not an Expense posting.
  void isMaintenanceCostAnExpense();

  const record = await insertMaintenanceRecord(context.db, {
    organizationId: context.organizationId,
    assetId: input.assetId,
    title: input.title,
    status: input.status ?? 'planned',
    performedOn: input.performedOn ?? null,
    costAmount: input.costAmount ?? null,
    currency: input.currency ?? null,
    vendorId: input.vendorId ?? null,
    notes: input.notes ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'assets');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MAINTENANCE_RECORD_CREATED,
    entityType: 'maintenance_record',
    entityId: record.id,
    after: {
      id: record.id,
      assetId: record.assetId,
      costAmount: record.costAmount,
      expensePosted: false,
    },
  });
  return record;
}
