'use server';

import {
  deleteQuoteSettingsBlock,
  upsertQuoteSettingsBlock,
} from '@/modules/quotes/application/manage-quote-settings';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import { getTranslations } from 'next-intl/server';
import { revalidatePath } from 'next/cache';

export interface QuoteSettingsFormState {
  error?: string;
  success?: boolean;
}

function formBool(formData: FormData, key: string): boolean {
  const value = formData.get(key);
  return value === 'true' || value === 'on' || value === '1';
}

function formNumber(formData: FormData, key: string, fallback: number): number {
  const raw = formData.get(key);
  if (raw === null) return fallback;
  const n = Number(String(raw));
  return Number.isFinite(n) ? n : fallback;
}

export async function saveQuoteSettingsBlockAction(
  _prev: QuoteSettingsFormState,
  formData: FormData,
): Promise<QuoteSettingsFormState> {
  try {
    await withOrgContext((context) =>
      upsertQuoteSettingsBlock(context, {
        blockId: String(formData.get('blockId') ?? '').trim() || undefined,
        title: String(formData.get('title') ?? '').trim(),
        body: String(formData.get('body') ?? ''),
        enabled: formBool(formData, 'enabled'),
        sortOrder: formNumber(formData, 'sortOrder', 0),
      }),
    );
    revalidatePath('/settings/quotes');
    return { success: true };
  } catch (error) {
    const tErrors = await getTranslations('errors');
    return mapServerActionError(error, { tErrors: (key) => tErrors(key as 'unexpected') });
  }
}

export async function deleteQuoteSettingsBlockAction(
  _prev: QuoteSettingsFormState,
  formData: FormData,
): Promise<QuoteSettingsFormState> {
  try {
    const blockId = String(formData.get('blockId') ?? '').trim();
    await withOrgContext((context) => deleteQuoteSettingsBlock(context, blockId));
    revalidatePath('/settings/quotes');
    return { success: true };
  } catch (error) {
    const tErrors = await getTranslations('errors');
    return mapServerActionError(error, { tErrors: (key) => tErrors(key as 'unexpected') });
  }
}
