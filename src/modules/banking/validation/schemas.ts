import { z } from 'zod';
import {
  BANK_MATCH_TARGET_KINDS,
  BANK_TXN_MATCH_STATUSES,
  BANK_USER_DECISIONS,
} from '../domain/types';

export const createBankAccountSchema = z.object({
  name: z.string().trim().min(1).max(200),
  currency: z.string().trim().length(3),
  accountMask: z.string().trim().max(64).nullable().optional(),
});

export const importBankStatementSchema = z.object({
  bankAccountId: z.string().uuid(),
  csvText: z.string().min(1).max(5_000_000),
  fileName: z.string().trim().max(500).nullable().optional(),
  source: z.enum(['csv_import', 'xlsx_import']).default('csv_import'),
});

export const listBankTransactionsSchema = z.object({
  bankAccountId: z.string().uuid().optional(),
  matchStatus: z
    .union([
      z.enum(BANK_TXN_MATCH_STATUSES),
      z.array(z.enum(BANK_TXN_MATCH_STATUSES)).min(1),
    ])
    .optional(),
});

export const decideBankMatchSchema = z.object({
  bankTransactionId: z.string().uuid(),
  decision: z.enum(BANK_USER_DECISIONS),
  targetKind: z.enum(BANK_MATCH_TARGET_KINDS).nullable().optional(),
  targetId: z.string().trim().min(1).max(80).nullable().optional(),
  appliedAmount: z.string().trim().max(40).nullable().optional(),
  currency: z.string().trim().length(3).nullable().optional(),
  notes: z.string().trim().max(2000).nullable().optional(),
  /** Caller-supplied: vendor bill already in Actual recognition. */
  billAlreadyRecognized: z.boolean().optional(),
});

export const refreshSuggestionsSchema = z.object({
  bankTransactionId: z.string().uuid(),
});

export type CreateBankAccountInput = z.infer<typeof createBankAccountSchema>;
export type ImportBankStatementInput = z.infer<typeof importBankStatementSchema>;
export type ListBankTransactionsInput = z.infer<typeof listBankTransactionsSchema>;
export type DecideBankMatchInput = z.infer<typeof decideBankMatchSchema>;
export type RefreshSuggestionsInput = z.infer<typeof refreshSuggestionsSchema>;
