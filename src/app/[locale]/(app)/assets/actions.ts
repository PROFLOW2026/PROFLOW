'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  archiveEquipmentUsage,
  archiveInventoryLocation,
  archiveMaterialUsage,
  createAsset,
  createFleetVehicle,
  createInventoryCount,
  createInventoryItem,
  createInventoryLocation,
  createMaintenanceRecord,
  finalizeInventoryCount,
  recordEquipmentUsage,
  recordInventoryMovement,
  recordMaterialUsage,
  releaseInventoryReservation,
  reserveInventory,
  updateAsset,
  updateFleetVehicle,
  updateInventoryLocation,
  updateMaintenanceRecord,
  upsertInventoryCountLine,
  voidInventoryCount,
} from '@/modules/assets';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface AssetsFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

/** Empty string / "__none__" clears optional UUID fields (check-in). */
function optionalUuidOrNull(formData: FormData, key: string): string | null | undefined {
  const raw = formData.get(key);
  if (raw === null) return undefined;
  const text = String(raw).trim();
  if (text === '' || text === '__none__') return null;
  return text;
}

function mapValidationError(error: ValidationError): AssetsFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path) fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

async function mapAppError(error: unknown): Promise<AssetsFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('assets');
  if (error instanceof ValidationError) return mapValidationError(error);
  if (error instanceof DomainRuleError) {
    const key = error.messageKey.replace(/^assets\./, '');
    try {
      return { error: t(key as 'errors.insufficientQuantity') };
    } catch {
      return { error: error.message };
    }
  }
  if (error instanceof AppError) return { error: tErrors('unexpected') };
  throw error;
}

export async function createAssetAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  const locale = await getLocale();
  try {
    const created = await withOrgContext((context) =>
      createAsset(context, {
        name: requiredFormValue(formData, 'name'),
        assetKind: formValue(formData, 'assetKind') as
          | 'equipment'
          | 'vehicle'
          | 'tool'
          | 'other'
          | undefined,
        status: formValue(formData, 'status') as
          | 'active'
          | 'in_maintenance'
          | 'retired'
          | 'disposed'
          | undefined,
        identifier: formValue(formData, 'identifier'),
        manufacturer: formValue(formData, 'manufacturer'),
        model: formValue(formData, 'model'),
        serialNumber: formValue(formData, 'serialNumber'),
        assignedProjectId: optionalUuidOrNull(formData, 'assignedProjectId') ?? undefined,
        notes: formValue(formData, 'notes'),
        plateNumber: formValue(formData, 'plateNumber'),
        vin: formValue(formData, 'vin'),
        odometer: formValue(formData, 'odometer'),
      }),
    );
    revalidatePath('/assets');
    revalidatePath('/assets/fleet');
    redirect({ href: `/assets/${created.asset.id}`, locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateAssetAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    const assetId = requiredFormValue(formData, 'assetId');
    await withOrgContext((context) =>
      updateAsset(context, {
        assetId,
        status: formValue(formData, 'status') as
          | 'active'
          | 'in_maintenance'
          | 'retired'
          | 'disposed'
          | undefined,
        assignedProjectId: optionalUuidOrNull(formData, 'assignedProjectId'),
      }),
    );
    revalidatePath('/assets');
    revalidatePath(`/assets/${assetId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createMaintenanceAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    const assetId = requiredFormValue(formData, 'assetId');
    await withOrgContext((context) =>
      createMaintenanceRecord(context, {
        assetId,
        title: requiredFormValue(formData, 'title'),
        status: formValue(formData, 'status') as
          | 'planned'
          | 'in_progress'
          | 'completed'
          | 'cancelled'
          | undefined,
        performedOn: formValue(formData, 'performedOn'),
        costAmount: formValue(formData, 'costAmount'),
        currency: formValue(formData, 'currency'),
        vendorId: optionalUuidOrNull(formData, 'vendorId') ?? undefined,
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/assets');
    revalidatePath('/assets/maintenance');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateMaintenanceStatusAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    const assetId = requiredFormValue(formData, 'assetId');
    await withOrgContext((context) =>
      updateMaintenanceRecord(context, {
        maintenanceRecordId: requiredFormValue(formData, 'maintenanceRecordId'),
        status: formValue(formData, 'status') as
          | 'planned'
          | 'in_progress'
          | 'completed'
          | 'cancelled'
          | undefined,
      }),
    );
    revalidatePath(`/assets/${assetId}`);
    revalidatePath('/assets');
    revalidatePath('/assets/maintenance');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createFleetVehicleAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  const locale = await getLocale();
  try {
    const assetId = optionalUuidOrNull(formData, 'assetId') ?? undefined;
    await withOrgContext((context) =>
      createFleetVehicle(context, {
        assetId: assetId ?? undefined,
        name: formValue(formData, 'name'),
        plateNumber: formValue(formData, 'plateNumber'),
        vin: formValue(formData, 'vin'),
        odometer: formValue(formData, 'odometer'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/assets/fleet');
    revalidatePath('/assets');
    redirect({ href: '/assets/fleet', locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateFleetVehicleAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      updateFleetVehicle(context, {
        fleetVehicleId: requiredFormValue(formData, 'fleetVehicleId'),
        plateNumber: formValue(formData, 'plateNumber'),
        vin: formValue(formData, 'vin'),
        odometer: formValue(formData, 'odometer'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/assets/fleet');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createInventoryItemAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  const locale = await getLocale();
  try {
    const created = await withOrgContext((context) =>
      createInventoryItem(context, {
        name: requiredFormValue(formData, 'name'),
        sku: formValue(formData, 'sku'),
        barcode: formValue(formData, 'barcode'),
        unit: formValue(formData, 'unit') ?? 'ea',
        quantityOnHand: formValue(formData, 'quantityOnHand') ?? '0',
        reorderLevel: formValue(formData, 'reorderLevel'),
        minStockLevel: formValue(formData, 'minStockLevel') ?? formValue(formData, 'reorderLevel'),
        materialItemId: optionalUuidOrNull(formData, 'materialItemId') ?? undefined,
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/assets/inventory');
    redirect({ href: `/assets/inventory/${created.id}`, locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function recordInventoryMovementAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    const inventoryItemId = requiredFormValue(formData, 'inventoryItemId');
    await withOrgContext((context) =>
      recordInventoryMovement(context, {
        inventoryItemId,
        movementType: requiredFormValue(formData, 'movementType') as
          | 'receive'
          | 'issue'
          | 'return'
          | 'adjust'
          | 'transfer',
        quantity: requiredFormValue(formData, 'quantity'),
        occurredOn: requiredFormValue(formData, 'occurredOn'),
        projectId: optionalUuidOrNull(formData, 'projectId') ?? undefined,
        workOrderId: optionalUuidOrNull(formData, 'workOrderId') ?? undefined,
        reservationId: optionalUuidOrNull(formData, 'reservationId') ?? undefined,
        fromLocationId: optionalUuidOrNull(formData, 'fromLocationId') ?? undefined,
        toLocationId: optionalUuidOrNull(formData, 'toLocationId') ?? undefined,
        locationId: optionalUuidOrNull(formData, 'locationId') ?? undefined,
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/assets/inventory');
    revalidatePath(`/assets/inventory/${inventoryItemId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createInventoryLocationAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      createInventoryLocation(context, {
        name: requiredFormValue(formData, 'name'),
        code: formValue(formData, 'code'),
        locationKind: formValue(formData, 'locationKind') as
          | 'warehouse'
          | 'site'
          | 'vehicle'
          | undefined,
        projectId: optionalUuidOrNull(formData, 'projectId') ?? undefined,
      }),
    );
    revalidatePath('/assets/inventory', 'layout');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateInventoryLocationAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      updateInventoryLocation(context, {
        locationId: requiredFormValue(formData, 'locationId'),
        name: formValue(formData, 'name'),
        code: formValue(formData, 'code'),
        locationKind: formValue(formData, 'locationKind') as
          | 'warehouse'
          | 'site'
          | 'vehicle'
          | undefined,
        projectId: optionalUuidOrNull(formData, 'projectId') ?? undefined,
      }),
    );
    revalidatePath('/assets/inventory', 'layout');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function archiveInventoryLocationAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      archiveInventoryLocation(context, {
        locationId: requiredFormValue(formData, 'locationId'),
      }),
    );
    revalidatePath('/assets/inventory', 'layout');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function reserveInventoryAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      reserveInventory(context, {
        inventoryItemId: requiredFormValue(formData, 'inventoryItemId'),
        quantity: requiredFormValue(formData, 'quantity'),
        projectId: optionalUuidOrNull(formData, 'projectId') ?? undefined,
        workOrderId: optionalUuidOrNull(formData, 'workOrderId') ?? undefined,
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/assets/inventory', 'layout');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function releaseInventoryReservationAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      releaseInventoryReservation(context, {
        reservationId: requiredFormValue(formData, 'reservationId'),
      }),
    );
    revalidatePath('/assets/inventory', 'layout');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function createInventoryCountAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      createInventoryCount(context, {
        locationId: requiredFormValue(formData, 'locationId'),
        countedOn: requiredFormValue(formData, 'countedOn'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/assets/inventory', 'layout');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function upsertInventoryCountLineAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      upsertInventoryCountLine(context, {
        countId: requiredFormValue(formData, 'countId'),
        inventoryItemId: requiredFormValue(formData, 'inventoryItemId'),
        countedQuantity: requiredFormValue(formData, 'countedQuantity'),
      }),
    );
    revalidatePath('/assets/inventory', 'layout');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function finalizeInventoryCountAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      finalizeInventoryCount(context, {
        countId: requiredFormValue(formData, 'countId'),
      }),
    );
    revalidatePath('/assets/inventory', 'layout');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function voidInventoryCountAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      voidInventoryCount(context, {
        countId: requiredFormValue(formData, 'countId'),
      }),
    );
    revalidatePath('/assets/inventory', 'layout');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function recordMaterialUsageAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    const projectId = requiredFormValue(formData, 'projectId');
    await withOrgContext((context) =>
      recordMaterialUsage(context, {
        projectId,
        description: requiredFormValue(formData, 'description'),
        quantity: requiredFormValue(formData, 'quantity'),
        unit: formValue(formData, 'unit'),
        usageDate: requiredFormValue(formData, 'usageDate'),
        materialId: optionalUuidOrNull(formData, 'materialId') ?? undefined,
        inventoryItemId: optionalUuidOrNull(formData, 'inventoryItemId') ?? undefined,
        employeeId: optionalUuidOrNull(formData, 'employeeId') ?? undefined,
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/jobs/${projectId}`);
    const inventoryItemId = optionalUuidOrNull(formData, 'inventoryItemId');
    if (inventoryItemId) {
      revalidatePath(`/assets/inventory/${inventoryItemId}`);
    }
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function recordEquipmentUsageAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    const projectId = requiredFormValue(formData, 'projectId');
    const assetId = requiredFormValue(formData, 'assetId');
    await withOrgContext((context) =>
      recordEquipmentUsage(context, {
        projectId,
        assetId,
        usageDate: requiredFormValue(formData, 'usageDate'),
        endDate: formValue(formData, 'endDate'),
        hours: formValue(formData, 'hours'),
        days: formValue(formData, 'days'),
        mileage: formValue(formData, 'mileage'),
        employeeId: optionalUuidOrNull(formData, 'employeeId') ?? undefined,
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/jobs/${projectId}`);
    revalidatePath(`/assets/${assetId}`);
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function archiveMaterialUsageAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      archiveMaterialUsage(context, {
        materialUsageId: requiredFormValue(formData, 'materialUsageId'),
      }),
    );
    revalidatePath('/projects');
    revalidatePath('/jobs');
    revalidatePath('/assets/inventory');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function archiveEquipmentUsageAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      archiveEquipmentUsage(context, {
        equipmentUsageId: requiredFormValue(formData, 'equipmentUsageId'),
      }),
    );
    revalidatePath('/projects');
    revalidatePath('/jobs');
    revalidatePath('/assets');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}
