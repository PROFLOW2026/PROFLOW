'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createAsset,
  createInventoryItem,
  createMaintenanceRecord,
  recordInventoryMovement,
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
        identifier: formValue(formData, 'identifier'),
        manufacturer: formValue(formData, 'manufacturer'),
        model: formValue(formData, 'model'),
        serialNumber: formValue(formData, 'serialNumber'),
        notes: formValue(formData, 'notes'),
        plateNumber: formValue(formData, 'plateNumber'),
        vin: formValue(formData, 'vin'),
        odometer: formValue(formData, 'odometer'),
      }),
    );
    revalidatePath('/assets');
    redirect({ href: `/assets/${created.asset.id}`, locale });
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
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath(`/assets/${assetId}`);
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
    await withOrgContext((context) =>
      createInventoryItem(context, {
        name: requiredFormValue(formData, 'name'),
        sku: formValue(formData, 'sku'),
        unit: formValue(formData, 'unit') ?? 'ea',
        quantityOnHand: formValue(formData, 'quantityOnHand') ?? '0',
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/assets/inventory');
    redirect({ href: '/assets/inventory', locale });
  } catch (error) {
    return mapAppError(error);
  }
}

export async function recordInventoryMovementAction(
  _prev: AssetsFormState,
  formData: FormData,
): Promise<AssetsFormState> {
  try {
    await withOrgContext((context) =>
      recordInventoryMovement(context, {
        inventoryItemId: requiredFormValue(formData, 'inventoryItemId'),
        movementType: requiredFormValue(formData, 'movementType') as 'receive' | 'issue',
        quantity: requiredFormValue(formData, 'quantity'),
        occurredOn: requiredFormValue(formData, 'occurredOn'),
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidatePath('/assets/inventory');
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}
