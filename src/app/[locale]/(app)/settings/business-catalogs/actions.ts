'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  createBusinessCatalogEntry,
  createDocumentRequirement,
  deactivateBusinessCatalogEntry,
  deactivateDocumentRequirement,
  setCostCodesEnabled,
  setDefaultPaymentTermKey,
  updateBusinessCatalogEntry,
} from '@/modules/business-catalog/application/manage-catalog';
import {
  isBusinessCatalogKind,
  PAYMENT_TERM_STRATEGIES,
  type PaymentTermStrategy,
} from '@/modules/business-catalog/domain/types';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import type { SettingsActionState } from '../actions';

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function formBool(formData: FormData, key: string): boolean {
  return formData.get(key) === 'on' || formData.get(key) === 'true';
}

function revalidateCatalogs(): void {
  revalidatePath('/settings/business-catalogs');
}

function buildPaymentMetadata(formData: FormData): Record<string, unknown> | undefined {
  const strategyRaw = formValue(formData, 'strategy');
  if (!strategyRaw) return undefined;
  if (!(PAYMENT_TERM_STRATEGIES as readonly string[]).includes(strategyRaw)) {
    return undefined;
  }
  const strategy = strategyRaw as PaymentTermStrategy;
  const metadata: Record<string, unknown> = { strategy };
  if (strategy === 'net_days') {
    const netDays = Number(formValue(formData, 'netDays') ?? '');
    if (Number.isFinite(netDays) && netDays >= 0) metadata.netDays = Math.floor(netDays);
  }
  if (strategy === 'eom_plus_days') {
    const eomOffsetDays = Number(formValue(formData, 'eomOffsetDays') ?? '');
    if (Number.isFinite(eomOffsetDays) && eomOffsetDays >= 0) {
      metadata.eomOffsetDays = Math.floor(eomOffsetDays);
    }
  }
  return metadata;
}

export async function createCatalogEntryAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const kind = formValue(formData, 'kind');
  const name = formValue(formData, 'name');
  if (!kind || !isBusinessCatalogKind(kind) || !name) {
    return { error: tErrors('validationFailed') };
  }

  try {
    const metadata =
      kind === 'payment_term'
        ? buildPaymentMetadata(formData) ?? { strategy: 'custom' }
        : kind === 'cost_code'
          ? (() => {
              const code = formValue(formData, 'code');
              return code ? { code } : {};
            })()
          : undefined;

    await withOrgContext((context) =>
      createBusinessCatalogEntry(context, {
        kind,
        name,
        description: formValue(formData, 'description') ?? null,
        parentId: formValue(formData, 'parentId') ?? null,
        metadata,
      }),
    );
    revalidateCatalogs();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function updateCatalogEntryAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const id = formValue(formData, 'id');
  const name = formValue(formData, 'name');
  if (!id || !name) return { error: tErrors('validationFailed') };

  try {
    const kind = formValue(formData, 'kind');
    const patch: {
      id: string;
      name: string;
      description?: string | null;
      metadata?: Record<string, unknown>;
      isActive?: boolean;
    } = {
      id,
      name,
      description: formValue(formData, 'description') ?? null,
    };
    if (kind === 'payment_term') {
      const metadata = buildPaymentMetadata(formData);
      if (metadata) patch.metadata = metadata;
    }
    if (kind === 'cost_code') {
      const code = formValue(formData, 'code');
      patch.metadata = code ? { code } : {};
    }
    const isActiveRaw = formValue(formData, 'isActive');
    if (isActiveRaw === 'true' || isActiveRaw === 'false') {
      patch.isActive = isActiveRaw === 'true';
    }

    await withOrgContext((context) => updateBusinessCatalogEntry(context, patch));
    revalidateCatalogs();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function deactivateCatalogEntryAction(id: string): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => deactivateBusinessCatalogEntry(context, id));
    revalidateCatalogs();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function setCostCodesEnabledAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    const enabled = formBool(formData, 'enabled');
    await withOrgContext((context) => setCostCodesEnabled(context, enabled));
    revalidateCatalogs();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function setDefaultPaymentTermKeyAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const key = formValue(formData, 'defaultPaymentTermKey');
  if (!key) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => setDefaultPaymentTermKey(context, key));
    revalidateCatalogs();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function createDocumentRequirementAction(
  _prev: SettingsActionState,
  formData: FormData,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  const contextKind = formValue(formData, 'contextKind');
  const documentTypeKey = formValue(formData, 'documentTypeKey');
  if (!contextKind || !documentTypeKey) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) =>
      createDocumentRequirement(context, {
        contextKind,
        contextKey: formValue(formData, 'contextKey') ?? null,
        documentTypeKey,
        label: formValue(formData, 'label') ?? null,
      }),
    );
    revalidateCatalogs();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function deactivateDocumentRequirementAction(
  id: string,
): Promise<SettingsActionState> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => deactivateDocumentRequirement(context, id));
    revalidateCatalogs();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
