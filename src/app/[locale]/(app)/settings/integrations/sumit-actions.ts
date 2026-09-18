'use server';

import {
  connectSumitTestConfiguration,
  disconnectSumitProvider,
} from '@/modules/invoicing-integration/server';
import { withOrgContext } from '@/shared/auth/session';
import { isAppError, mapServerActionError } from '@/shared/errors';
import { getTranslations } from 'next-intl/server';

export interface SumitActionResult {
  error?: string;
  ok?: boolean;
}

function logUnmappedSumitConnectError(error: unknown): void {
  if (error instanceof Error && isAppError(error)) return;
  console.error('[invoicing][sumit] connect action unmapped error', {
    name: error instanceof Error ? error.name : 'unknown',
    message:
      error instanceof Error ? error.message.slice(0, 200) : String(error).slice(0, 200),
  });
}

async function mapSumitConnectError(error: unknown): Promise<string> {
  const tErrors = await getTranslations('errors');
  const tInvoicing = await getTranslations('invoicingIntegration');

  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      invoicingIntegration: (key) => tInvoicing(key as 'errors.connectionFailed'),
    },
    rethrowUnknown: false,
  });

  return mapped.error;
}

export async function connectSumitTestAction(input: {
  companyId: number;
  apiKey: string;
}): Promise<SumitActionResult> {
  try {
    await withOrgContext((context) => connectSumitTestConfiguration(context, input));
    return { ok: true };
  } catch (error) {
    logUnmappedSumitConnectError(error);
    return { error: await mapSumitConnectError(error) };
  }
}

export async function disconnectSumitTestAction(): Promise<SumitActionResult> {
  try {
    await withOrgContext((context) => disconnectSumitProvider(context));
    return { ok: true };
  } catch (error) {
    logUnmappedSumitConnectError(error);
    return { error: await mapSumitConnectError(error) };
  }
}
