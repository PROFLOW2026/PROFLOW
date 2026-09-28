'use server';

import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { mapServerActionError } from '@/shared/errors';
import { createBankAccount } from './accounts';
import { decideBankMatch } from './decide-match';
import { importBankStatement } from './import-statement';
import { refreshBankMatchSuggestions } from './suggest-matches';
import type {
  BankAccount,
  BankMatchCandidate,
  BankMatchSuggestion,
  BankTransaction,
} from '../domain/types';
import {
  createBankAccountSchema,
  decideBankMatchSchema,
  importBankStatementSchema,
  refreshSuggestionsSchema,
  type CreateBankAccountInput,
  type DecideBankMatchInput,
  type ImportBankStatementInput,
  type RefreshSuggestionsInput,
} from '../validation/schemas';

type ActionFail = { readonly ok: false; readonly error: string };

async function mapBankingActionError(error: unknown, fallbackKey: string): Promise<string> {
  const tErrors = await getTranslations('errors');
  const tBanking = await getTranslations('banking');
  const mapped = mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      banking: (key) => tBanking(key as 'errors.importFailed'),
    },
    rethrowUnknown: false,
  });
  if (mapped.error !== tErrors('unexpected')) return mapped.error;
  try {
    return tBanking(fallbackKey as 'errors.importFailed');
  } catch {
    return tErrors('unexpected');
  }
}

async function validationFailedMessage(): Promise<string> {
  const tErrors = await getTranslations('errors');
  return tErrors('validationFailed');
}

export async function createBankAccountAction(
  raw: CreateBankAccountInput,
): Promise<{ ok: true; account: BankAccount } | ActionFail> {
  const parsed = createBankAccountSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: await validationFailedMessage() };
  }
  try {
    const account = await withOrgContext(async (context) =>
      createBankAccount(context, parsed.data),
    );
    return { ok: true, account };
  } catch (error) {
    return { ok: false, error: await mapBankingActionError(error, 'errors.importFailed') };
  }
}

export async function importBankStatementAction(
  raw: ImportBankStatementInput,
): Promise<
  | {
      ok: true;
      imported: BankTransaction[];
      importedCount: number;
      duplicateCount: number;
      invalidRows: number;
      financialMutationPerformed: false;
    }
  | ActionFail
> {
  const parsed = importBankStatementSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: await validationFailedMessage() };
  }
  try {
    const result = await withOrgContext(async (context) =>
      importBankStatement(context, parsed.data),
    );
    return {
      ok: true,
      imported: [...result.imported],
      importedCount: result.imported.length,
      duplicateCount: result.skippedDuplicates,
      invalidRows: result.invalidRows,
      financialMutationPerformed: false,
    };
  } catch (error) {
    return { ok: false, error: await mapBankingActionError(error, 'errors.importFailed') };
  }
}

/**
 * Refresh suggestions. Optional `candidates` from billing/AP open items;
 * empty means no suggestions until those modules inject candidates.
 */
export async function refreshSuggestionsAction(
  raw: RefreshSuggestionsInput & {
    candidates?: readonly BankMatchCandidate[];
  },
): Promise<{ ok: true; suggestions: BankMatchSuggestion[] } | ActionFail> {
  const parsed = refreshSuggestionsSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: await validationFailedMessage() };
  }
  try {
    const suggestions = await withOrgContext(async (context) =>
      refreshBankMatchSuggestions(
        context,
        parsed.data,
        raw.candidates ?? [],
      ),
    );
    return { ok: true, suggestions: [...suggestions] };
  } catch (error) {
    return { ok: false, error: await mapBankingActionError(error, 'errors.decideFailed') };
  }
}

export async function decideBankMatchAction(
  raw: DecideBankMatchInput,
): Promise<
  | {
      ok: true;
      transaction: BankTransaction;
      financialMutationPerformed: false;
    }
  | ActionFail
> {
  const parsed = decideBankMatchSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: await validationFailedMessage() };
  }
  try {
    const result = await withOrgContext(async (context) =>
      decideBankMatch(context, parsed.data),
    );
    return {
      ok: true,
      transaction: result.transaction,
      financialMutationPerformed: false,
    };
  } catch (error) {
    return { ok: false, error: await mapBankingActionError(error, 'errors.decideFailed') };
  }
}
