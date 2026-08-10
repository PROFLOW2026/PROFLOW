import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getBankingRepository } from '../data/banking.repository';
import { areBankingPersistenceAvailable } from '../domain/persistence';
import type { BankAccount, BankAccountStatus } from '../domain/types';
import {
  createBankAccountSchema,
  type CreateBankAccountInput,
} from '../validation/schemas';

function assertBankingSchemaReady(): void {
  if (!areBankingPersistenceAvailable()) {
    throw new DomainRuleError(
      'Banking schema is not available yet',
      'banking.errors.schemaPending',
    );
  }
}

export async function createBankAccount(
  context: OrgContext,
  raw: CreateBankAccountInput,
): Promise<BankAccount> {
  assertPermission(context, PERMISSIONS.BANKING_MANAGE);
  assertBankingSchemaReady();
  const input = createBankAccountSchema.parse(raw);
  return getBankingRepository().createAccount(context.db, {
    organizationId: context.organizationId,
    name: input.name,
    currency: input.currency,
    accountMask: input.accountMask,
  });
}

export async function listBankAccounts(context: OrgContext): Promise<BankAccount[]> {
  assertPermission(context, PERMISSIONS.BANKING_READ);
  return getBankingRepository().listAccounts(context.db, context.organizationId);
}

export async function getBankAccount(
  context: OrgContext,
  accountId: string,
): Promise<BankAccount | null> {
  assertPermission(context, PERMISSIONS.BANKING_READ);
  return getBankingRepository().findAccount(context.db, context.organizationId, accountId);
}

export async function archiveBankAccount(
  context: OrgContext,
  accountId: string,
  status: BankAccountStatus = 'archived',
): Promise<BankAccount | null> {
  assertPermission(context, PERMISSIONS.BANKING_MANAGE);
  assertBankingSchemaReady();
  return getBankingRepository().setAccountStatus(
    context.db,
    context.organizationId,
    accountId,
    status,
  );
}
