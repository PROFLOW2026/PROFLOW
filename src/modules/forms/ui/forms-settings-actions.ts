'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  archiveFormTemplate,
  createFormTemplate,
  updateFormTemplate,
} from '@/modules/forms';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface FormsActionState {
  ok?: boolean;
  error?: string;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export async function createTemplateAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const tErrors = await getTranslations('errors');
  const name = formValue(formData, 'name');
  const schemaRaw = formValue(formData, 'schemaJson');
  if (!name || !schemaRaw) return { error: tErrors('validationFailed') };

  let schema: unknown;
  try {
    schema = JSON.parse(schemaRaw);
  } catch {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) =>
      createFormTemplate(context, {
        name,
        description: formValue(formData, 'description') ?? null,
        category: formValue(formData, 'category') ?? null,
        schema: schema as {
          version?: 1;
          fields: Array<{
            key: string;
            type:
              | 'checklist'
              | 'yes_no'
              | 'text'
              | 'number'
              | 'date'
              | 'photo'
              | 'notes'
              | 'signature';
            label: string;
            required?: boolean;
            helpText?: string | null;
            items?: Array<string | { key: string; label: string }>;
          }>;
        },
        enabled: formData.get('enabled') === 'true' || formData.get('enabled') === 'on',
      }),
    );
    revalidatePath('/settings/forms');
    revalidatePath('/forms');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function archiveTemplateAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const tErrors = await getTranslations('errors');
  const templateId = formValue(formData, 'templateId');
  if (!templateId) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => archiveFormTemplate(context, { templateId }));
    revalidatePath('/settings/forms');
    revalidatePath('/forms');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function setTemplateEnabledAction(
  _prev: FormsActionState,
  formData: FormData,
): Promise<FormsActionState> {
  const tErrors = await getTranslations('errors');
  const templateId = formValue(formData, 'templateId');
  const enabledRaw = formValue(formData, 'enabled');
  if (!templateId || enabledRaw === undefined) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) =>
      updateFormTemplate(context, {
        templateId,
        enabled: enabledRaw === 'true',
      }),
    );
    revalidatePath('/settings/forms');
    revalidatePath('/forms');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
