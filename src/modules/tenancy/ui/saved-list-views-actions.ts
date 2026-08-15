'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  deleteSavedListView,
  isSavedListKey,
  saveSavedListView,
} from '@/modules/tenancy';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface SavedViewActionState {
  ok?: boolean;
  error?: string;
}

function parseQuery(raw: FormDataEntryValue | null): Record<string, string> {
  if (typeof raw !== 'string' || !raw.trim()) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === 'string') out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export async function saveSavedListViewAction(
  _prev: SavedViewActionState,
  formData: FormData,
): Promise<SavedViewActionState> {
  const tErrors = await getTranslations('errors');
  const listKey = String(formData.get('listKey') ?? '');
  if (!isSavedListKey(listKey)) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) =>
      saveSavedListView(context, {
        listKey,
        name: String(formData.get('name') ?? ''),
        query: parseQuery(formData.get('queryJson')),
        isDefault: formData.get('isDefault') === '1',
      }),
    );
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function deleteSavedListViewAction(
  _prev: SavedViewActionState,
  formData: FormData,
): Promise<SavedViewActionState> {
  const tErrors = await getTranslations('errors');
  const id = String(formData.get('id') ?? '');
  if (!id) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => deleteSavedListView(context, id));
    revalidatePath('/', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}
