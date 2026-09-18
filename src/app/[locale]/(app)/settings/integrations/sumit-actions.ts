'use server';

import {
  connectSumitTestConfiguration,
  disconnectSumitProvider,
} from '@/modules/invoicing-integration/server';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { getTranslations } from 'next-intl/server';

export interface SumitActionResult {
  error?: string;
  ok?: boolean;
}

async function mapError(error: unknown): Promise<string> {
  const t = await getTranslations('invoicingIntegration.errors');
  if (error instanceof AppError && error.messageKey?.startsWith('invoicingIntegration.')) {
    const key = error.messageKey.replace('invoicingIntegration.errors.', '') as
      | 'connectionFailed'
      | 'productionBlocked';
    return t(key);
  }
  return t('connectionFailed');
}

export async function connectSumitTestAction(input: {
  companyId: number;
  apiKey: string;
}): Promise<SumitActionResult> {
  try {
    await withOrgContext((context) => connectSumitTestConfiguration(context, input));
    return { ok: true };
  } catch (error) {
    return { error: await mapError(error) };
  }
}

export async function disconnectSumitTestAction(): Promise<SumitActionResult> {
  try {
    await withOrgContext((context) => disconnectSumitProvider(context));
    return { ok: true };
  } catch (error) {
    return { error: await mapError(error) };
  }
}
