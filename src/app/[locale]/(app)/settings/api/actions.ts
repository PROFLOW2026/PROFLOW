'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  createApiClient,
  createApiKey,
  enqueueWebhookDelivery,
  registerWebhookEndpoint,
  revokeApiKey,
  revokeWebhookEndpoint,
  rotateApiKey,
  rotateWebhookSecret,
  recordWebhookDeliveryAttempt,
  API_KEY_SCOPES,
  WEBHOOK_EVENT_TYPES,
} from '@/modules/api';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface ApiActionState {
  ok?: boolean;
  error?: string;
  plaintextKey?: string;
  plaintextSecret?: string;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

export async function createApiClientAction(
  _prev: ApiActionState,
  formData: FormData,
): Promise<ApiActionState> {
  const tErrors = await getTranslations('errors');
  const name = formValue(formData, 'name');
  if (!name) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => createApiClient(context, { name }));
    revalidatePath('/settings/api');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function createApiKeyAction(
  _prev: ApiActionState,
  formData: FormData,
): Promise<ApiActionState> {
  const tErrors = await getTranslations('errors');
  const apiClientId = formValue(formData, 'apiClientId');
  const name = formValue(formData, 'name');
  const scopes = formData
    .getAll('scopes')
    .map(String)
    .filter((scope) => (API_KEY_SCOPES as readonly string[]).includes(scope));

  if (!apiClientId || !name || scopes.length === 0) {
    return { error: tErrors('validationFailed') };
  }

  try {
    const result = await withOrgContext((context) =>
      createApiKey(context, {
        apiClientId,
        name,
        scopes: scopes as [(typeof API_KEY_SCOPES)[number], ...(typeof API_KEY_SCOPES)[number][]],
      }),
    );
    revalidatePath('/settings/api');
    return { ok: true, plaintextKey: result.plaintext };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function revokeApiKeyAction(
  _prev: ApiActionState,
  formData: FormData,
): Promise<ApiActionState> {
  const tErrors = await getTranslations('errors');
  const keyId = formValue(formData, 'keyId');
  if (!keyId) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => revokeApiKey(context, { keyId }));
    revalidatePath('/settings/api');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function rotateApiKeyAction(
  _prev: ApiActionState,
  formData: FormData,
): Promise<ApiActionState> {
  const tErrors = await getTranslations('errors');
  const keyId = formValue(formData, 'keyId');
  if (!keyId) return { error: tErrors('validationFailed') };

  try {
    const result = await withOrgContext((context) => rotateApiKey(context, { keyId }));
    revalidatePath('/settings/api');
    return { ok: true, plaintextKey: result.plaintext };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function registerWebhookAction(
  _prev: ApiActionState,
  formData: FormData,
): Promise<ApiActionState> {
  const tErrors = await getTranslations('errors');
  const url = formValue(formData, 'url');
  const eventTypes = formData
    .getAll('eventTypes')
    .map(String)
    .filter((event) => (WEBHOOK_EVENT_TYPES as readonly string[]).includes(event));

  if (!url || eventTypes.length === 0) return { error: tErrors('validationFailed') };

  try {
    const result = await withOrgContext((context) =>
      registerWebhookEndpoint(context, {
        url,
        eventTypes: eventTypes as [
          (typeof WEBHOOK_EVENT_TYPES)[number],
          ...(typeof WEBHOOK_EVENT_TYPES)[number][],
        ],
      }),
    );
    revalidatePath('/settings/api');
    return { ok: true, plaintextSecret: result.plaintextSecret };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function revokeWebhookAction(
  _prev: ApiActionState,
  formData: FormData,
): Promise<ApiActionState> {
  const tErrors = await getTranslations('errors');
  const endpointId = formValue(formData, 'endpointId');
  if (!endpointId) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => revokeWebhookEndpoint(context, { endpointId }));
    revalidatePath('/settings/api');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function rotateWebhookSecretAction(
  _prev: ApiActionState,
  formData: FormData,
): Promise<ApiActionState> {
  const tErrors = await getTranslations('errors');
  const endpointId = formValue(formData, 'endpointId');
  if (!endpointId) return { error: tErrors('validationFailed') };

  try {
    const result = await withOrgContext((context) =>
      rotateWebhookSecret(context, { endpointId }),
    );
    revalidatePath('/settings/api');
    return { ok: true, plaintextSecret: result.plaintextSecret };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function enqueueDeliveryAction(
  _prev: ApiActionState,
  formData: FormData,
): Promise<ApiActionState> {
  const tErrors = await getTranslations('errors');
  const endpointId = formValue(formData, 'endpointId');
  const eventType = formValue(formData, 'eventType') ?? 'test.ping';
  if (!endpointId) return { error: tErrors('validationFailed') };
  if (!(WEBHOOK_EVENT_TYPES as readonly string[]).includes(eventType)) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) =>
      enqueueWebhookDelivery(context, {
        endpointId,
        eventType: eventType as (typeof WEBHOOK_EVENT_TYPES)[number],
        payload: { source: 'settings', at: new Date().toISOString() },
      }),
    );
    revalidatePath('/settings/api');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function recordDeliveryAttemptAction(
  _prev: ApiActionState,
  formData: FormData,
): Promise<ApiActionState> {
  const tErrors = await getTranslations('errors');
  const deliveryId = formValue(formData, 'deliveryId');
  const outcome = formValue(formData, 'outcome');
  if (!deliveryId || (outcome !== 'success' && outcome !== 'failure')) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) =>
      recordWebhookDeliveryAttempt(context, {
        deliveryId,
        outcome,
        httpStatus: outcome === 'success' ? 200 : 500,
        error: outcome === 'failure' ? 'Manual debug attempt (no outbound HTTP)' : null,
      }),
    );
    revalidatePath('/settings/api');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
