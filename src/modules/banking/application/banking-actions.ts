'use server';

import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, AuthorizationError, DomainRuleError } from '@/shared/errors';
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

async function failMessage(error: unknown, fallbackKey: string): Promise<string> {
  try {
    const t = await getTranslations('banking');
    if (
      error instanceof DomainRuleError &&
      error.messageKey.startsWith('banking.errors.')
    ) {
      const key = error.messageKey.replace('banking.', '') as 'errors.targetRequired';
      try {
        return t(key);
      } catch {
        /* fall through */
      }
    }
  } catch {
    /* banking namespace may not be wired yet */
  }

  if (error instanceof AuthorizationError) {
    try {
      const t = await getTranslations('errors');
      return t('notAllowed');
    } catch {
      return 'Not allowed';
    }
  }
  if (error instanceof AppError) return error.message;
  if (error instanceof Error && error.message.trim()) return error.message;

  try {
    const t = await getTranslations('banking');
    return t(fallbackKey as 'errors.importFailed');
  } catch {
    return 'Request failed';
  }
}

export async function createBankAccountAction(
  raw: CreateBankAccountInput,
): Promise<{ ok: true; account: BankAccount } | ActionFail> {
  const parsed = createBankAccountSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' };
  }
  try {
    const account = await withOrgContext(async (context) =>
      createBankAccount(context, parsed.data),
    );
    return { ok: true, account };
  } catch (error) {
    return { ok: false, error: await failMessage(error, 'errors.importFailed') };
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' };
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
    return { ok: false, error: await failMessage(error, 'errors.importFailed') };
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' };
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
    return { ok: false, error: await failMessage(error, 'errors.decideFailed') };
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
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Validation failed' };
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
    return { ok: false, error: await failMessage(error, 'errors.decideFailed') };
  }
}
