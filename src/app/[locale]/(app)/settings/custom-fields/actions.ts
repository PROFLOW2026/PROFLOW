'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  archiveCustomFieldDefinition,
  createCustomFieldDefinition,
  upsertCustomFieldValue,
  CUSTOM_FIELD_ENTITY_TYPES,
  CUSTOM_FIELD_TYPES,
} from '@/modules/custom-fields';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface CustomFieldsActionState {
  ok?: boolean;
  error?: string;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export async function createDefinitionAction(
  _prev: CustomFieldsActionState,
  formData: FormData,
): Promise<CustomFieldsActionState> {
  const tErrors = await getTranslations('errors');
  const entityType = formValue(formData, 'entityType');
  const fieldType = formValue(formData, 'fieldType');
  const key = formValue(formData, 'key');
  const label = formValue(formData, 'label');

  if (
    !entityType ||
    !fieldType ||
    !key ||
    !label ||
    !(CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(entityType) ||
    !(CUSTOM_FIELD_TYPES as readonly string[]).includes(fieldType)
  ) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) =>
      createCustomFieldDefinition(context, {
        entityType: entityType as (typeof CUSTOM_FIELD_ENTITY_TYPES)[number],
        fieldType: fieldType as (typeof CUSTOM_FIELD_TYPES)[number],
        key,
        label,
        required: formData.get('required') === 'true' || formData.get('required') === 'on',
      }),
    );
    revalidatePath('/settings/custom-fields');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function archiveDefinitionAction(
  _prev: CustomFieldsActionState,
  formData: FormData,
): Promise<CustomFieldsActionState> {
  const tErrors = await getTranslations('errors');
  const definitionId = formValue(formData, 'definitionId');
  if (!definitionId) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) =>
      archiveCustomFieldDefinition(context, { definitionId }),
    );
    revalidatePath('/settings/custom-fields');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function upsertEntityFieldValueAction(
  _prev: CustomFieldsActionState,
  formData: FormData,
): Promise<CustomFieldsActionState> {
  const tErrors = await getTranslations('errors');
  const definitionId = formValue(formData, 'definitionId');
  const entityId = formValue(formData, 'entityId');
  const fieldType = formValue(formData, 'fieldType');
  if (!definitionId || !entityId) return { error: tErrors('validationFailed') };

  const valueText = formValue(formData, 'valueText');
  const valueNumber = formValue(formData, 'valueNumber');
  const valueDate = formValue(formData, 'valueDate');
  const valueBoolRaw = formValue(formData, 'valueBool');

  try {
    await withOrgContext((context) =>
      upsertCustomFieldValue(context, {
        definitionId,
        entityId,
        valueText: fieldType === 'text' || fieldType === 'select' ? valueText ?? null : null,
        valueNumber:
          fieldType === 'number' || fieldType === 'money' ? valueNumber ?? null : null,
        valueDate: fieldType === 'date' ? valueDate ?? null : null,
        valueBool:
          fieldType === 'boolean'
            ? valueBoolRaw === 'true' || valueBoolRaw === 'on'
            : null,
        valueJson:
          fieldType === 'multi_select' || fieldType === 'reference'
            ? valueText
              ? valueText.split(',').map((part) => part.trim()).filter(Boolean)
              : []
            : undefined,
      }),
    );
    const revalidate = formValue(formData, 'revalidatePath');
    if (revalidate) revalidatePath(revalidate);
    revalidatePath('/settings/custom-fields');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}
