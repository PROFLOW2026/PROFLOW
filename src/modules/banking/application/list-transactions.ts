import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getBankingRepository } from '../data/banking.repository';
import type {
  BankMatchDecision,
  BankMatchSuggestion,
  BankTransaction,
} from '../domain/types';
import {
  listBankTransactionsSchema,
  type ListBankTransactionsInput,
} from '../validation/schemas';

export async function listBankTransactions(
  context: OrgContext,
  raw: ListBankTransactionsInput = {},
): Promise<BankTransaction[]> {
  assertPermission(context, PERMISSIONS.BANKING_READ);
  const input = listBankTransactionsSchema.parse(raw);
  return getBankingRepository().listTransactions(context.db, context.organizationId, {
    bankAccountId: input.bankAccountId,
    matchStatus: input.matchStatus,
  });
}

export async function getBankTransactionDetail(
  context: OrgContext,
  transactionId: string,
): Promise<{
  transaction: BankTransaction;
  suggestions: readonly BankMatchSuggestion[];
  decisions: readonly BankMatchDecision[];
} | null> {
  assertPermission(context, PERMISSIONS.BANKING_READ);
  const repo = getBankingRepository();
  const transaction = await repo.findTransaction(
    context.db,
    context.organizationId,
    transactionId,
  );
  if (!transaction) return null;
  const [suggestions, decisions] = await Promise.all([
    repo.listSuggestions(context.db, context.organizationId, transactionId),
    repo.listDecisions(context.db, context.organizationId, transactionId),
  ]);
  return { transaction, suggestions, decisions };
}
