'use server';

import { updateExpenseIngestionSettings } from '@/modules/expense-ingestion/application/update-settings';
import type { ExpenseIngestionProvider } from '@/modules/expense-ingestion';
import { withOrgContext } from '@/shared/auth/session';
import { isAppError, mapServerActionError } from '@/shared/errors';
import { getTranslations } from 'next-intl/server';

export interface ExpenseIngestionActionResult {
  error?: string;
  ok?: boolean;
}

async function mapActionError(error: unknown): Promise<string> {
  const tErrors = await getTranslations('errors');
  const tExpenses = await getTranslations('expenses');
  const tInvoicing = await getTranslations('invoicingIntegration');
  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      expenses: (key) => tExpenses(key as 'received.errors.ocrRequired'),
      invoicingIntegration: (key) => tInvoicing(key as 'errors.connectionRequired'),
    },
    rethrowUnknown: false,
  });
  return mapped.error;
}

export async function updateExpenseIngestionSettingsAction(input: {
  provider: ExpenseIngestionProvider;
}): Promise<ExpenseIngestionActionResult> {
  try {
    await withOrgContext((context) =>
      updateExpenseIngestionSettings(context, input.provider),
    );
    return { ok: true };
  } catch (error) {
    if (!(error instanceof Error && isAppError(error))) {
      console.error('[expense-ingestion] settings action error', error);
    }
    return { error: await mapActionError(error) };
  }
}
