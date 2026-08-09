import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { todayInTimeZone } from '@/shared/dates/dates';
import { findVendorById } from '@/modules/vendors';
import { isMaintenanceCostAnExpense } from '../domain/inventory';
import {
  canTransitionMaintenanceStatus,
  partitionMaintenanceBySchedule,
} from '../domain/maintenance';
import type { MaintenanceStatus } from '../domain/types';
import {
  findAssetById,
  findMaintenanceById,
  insertMaintenanceRecord,
  listMaintenanceForAsset,
  listMaintenanceForOrg,
  updateMaintenanceRecordById,
} from '../data/assets.repository';
import {
  createMaintenanceRecordSchema,
  updateMaintenanceRecordSchema,
  type CreateMaintenanceRecordInput,
  type UpdateMaintenanceRecordInput,
} from '../validation/schemas';

export async function listMaintenanceRecordsForAsset(context: OrgContext, assetId: string) {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const asset = await findAssetById(context.db, context.organizationId, assetId);
  if (!asset) throw new NotFoundError('Asset');
  return listMaintenanceForAsset(context.db, context.organizationId, assetId);
}

export async function listMaintenanceScheduleForOrg(context: OrgContext) {
  assertPermission(context, PERMISSIONS.ASSETS_READ);
  const records = await listMaintenanceForOrg(context.db, context.organizationId);
  const today = todayInTimeZone(context.organization.timezone);
  return {
    today,
    ...partitionMaintenanceBySchedule(records, today),
    all: records,
  };
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

  if (input.costAmount != null && !input.currency) {
    throw new ValidationError([
      { path: 'currency', message: 'Currency is required when costAmount is set' },
    ]);
  }
  if (input.currency && input.costAmount == null) {
    throw new ValidationError([
      { path: 'costAmount', message: 'costAmount is required when currency is set' },
    ]);
  }

  const record = await insertMaintenanceRecord(context.db, {
    organizationId: context.organizationId,
    assetId: input.assetId,
    title: input.title,
    status: input.status ?? 'planned',
    performedOn: input.performedOn ?? null,
    costAmount: input.costAmount ?? null,
    currency: input.currency ? input.currency.toUpperCase() : null,
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
      expenseLink: null,
    },
  });
  return record;
}

export async function updateMaintenanceRecord(
  context: OrgContext,
  raw: UpdateMaintenanceRecordInput,
) {
  assertPermission(context, PERMISSIONS.ASSETS_MANAGE);
  const parsed = updateMaintenanceRecordSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  const existing = await findMaintenanceById(
    context.db,
    context.organizationId,
    input.maintenanceRecordId,
  );
  if (!existing || existing.archivedAt) throw new NotFoundError('Maintenance record');

  if (
    input.status &&
    !canTransitionMaintenanceStatus(existing.status, input.status as MaintenanceStatus)
  ) {
    throw new DomainRuleError(
      `Cannot transition maintenance from ${existing.status} to ${input.status}`,
      'assets.errors.invalidMaintenanceTransition',
    );
  }

  if (input.vendorId) {
    const vendor = await findVendorById(context.db, context.organizationId, input.vendorId);
    if (!vendor || vendor.archivedAt) throw new NotFoundError('Vendor');
  }

  // Hard rule: never create Expense from maintenance cost updates.
  void isMaintenanceCostAnExpense();

  const nextCostAmount =
    input.costAmount !== undefined ? input.costAmount : existing.costAmount;
  const nextCurrencyRaw =
    input.currency !== undefined ? input.currency : existing.currency;
  const nextCurrency = nextCurrencyRaw ? nextCurrencyRaw.toUpperCase() : null;

  if (nextCostAmount != null && !nextCurrency) {
    throw new ValidationError([
      { path: 'currency', message: 'Currency is required when costAmount is set' },
    ]);
  }
  if (nextCurrency && nextCostAmount == null) {
    throw new ValidationError([
      { path: 'costAmount', message: 'costAmount is required when currency is set' },
    ]);
  }

  let performedOn =
    input.performedOn === undefined ? undefined : input.performedOn;
  if (
    input.status === 'completed' &&
    performedOn === undefined &&
    !existing.performedOn
  ) {
    performedOn = todayInTimeZone(context.organization.timezone);
  }

  const updated = await updateMaintenanceRecordById(
    context.db,
    context.organizationId,
    input.maintenanceRecordId,
    {
      title: input.title,
      status: input.status as MaintenanceStatus | undefined,
      performedOn,
      costAmount: input.costAmount === undefined ? undefined : input.costAmount,
      currency:
        input.currency === undefined
          ? undefined
          : input.currency
            ? input.currency.toUpperCase()
            : null,
      vendorId: input.vendorId === undefined ? undefined : input.vendorId,
      notes: input.notes === undefined ? undefined : input.notes,
    },
  );
  if (!updated) throw new NotFoundError('Maintenance record');

  await noteModuleUsage(context.db, context.organizationId, 'assets');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.MAINTENANCE_RECORD_UPDATED,
    entityType: 'maintenance_record',
    entityId: updated.id,
    before: { status: existing.status, costAmount: existing.costAmount },
    after: {
      status: updated.status,
      costAmount: updated.costAmount,
      expensePosted: false,
      expenseLink: null,
    },
  });

  return updated;
}
