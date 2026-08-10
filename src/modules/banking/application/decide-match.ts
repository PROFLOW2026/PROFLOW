import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getBankingRepository } from '../data/banking.repository';
import { assertBankMatchTargetInOrganization } from '../data/match-target-guard';
import { buildBankMatchDecision } from '../domain/decisions';
import { assertBankMatchDoesNotMutateFinancials } from '../domain/cost-guard';
import { areBankingPersistenceAvailable } from '../domain/persistence';
import type { BankMatchDecision, BankTransaction } from '../domain/types';
import {
  decideBankMatchSchema,
  type DecideBankMatchInput,
} from '../validation/schemas';

export interface DecideBankMatchAppResult {
  readonly decision: BankMatchDecision;
  readonly transaction: BankTransaction;
  /** Always false — no payment/bill/expense/cost write occurs here. */
  readonly financialMutationPerformed: false;
}

function assertBankingSchemaReady(): void {
  if (!areBankingPersistenceAvailable()) {
    throw new DomainRuleError(
      'Banking schema is not available yet',
      'banking.errors.schemaPending',
    );
  }
}

function isTestDoubleRepo(repo: ReturnType<typeof getBankingRepository>): boolean {
  return '__testDouble' in repo && (repo as { __testDouble?: boolean }).__testDouble === true;
}

/**
 * Approve / Change / Ignore a suggested (or user-chosen) match.
 *
 * Records reconciliation intent only. Callers that later create a customer
 * or vendor payment must do so via billing/AP modules — never from this path.
 * mutates_financials remains false.
 */
export async function decideBankMatch(
  context: OrgContext,
  raw: DecideBankMatchInput,
): Promise<DecideBankMatchAppResult> {
  assertPermission(context, PERMISSIONS.BANKING_MANAGE);
  assertBankingSchemaReady();
  assertBankMatchDoesNotMutateFinancials();
  const input = decideBankMatchSchema.parse(raw);
  const repo = getBankingRepository();
  const txn = await repo.findTransaction(
    context.db,
    context.organizationId,
    input.bankTransactionId,
  );
  if (!txn) throw new NotFoundError('Bank transaction');

  const built = buildBankMatchDecision({
    organizationId: context.organizationId,
    bankTransactionId: txn.id,
    decision: input.decision,
    targetKind: input.targetKind,
    targetId: input.targetId,
    appliedAmount: input.appliedAmount,
    currency: input.currency,
    notes: input.notes,
    txnDirection: txn.direction,
    txnAmount: txn.amount,
    txnCurrency: txn.currency,
    billAlreadyRecognized: input.billAlreadyRecognized,
  });

  if (
    built.decision.targetKind &&
    built.decision.targetId &&
    !isTestDoubleRepo(repo)
  ) {
    await assertBankMatchTargetInOrganization(
      context.db,
      context.organizationId,
      built.decision.targetKind,
      built.decision.targetId,
    );
  }

  const decision = await repo.insertDecision(context.db, built.decision);
  const transaction = await repo.updateTransactionMatchStatus(
    context.db,
    context.organizationId,
    txn.id,
    built.nextMatchStatus,
  );
  if (!transaction) throw new NotFoundError('Bank transaction');

  return {
    decision,
    transaction,
    financialMutationPerformed: false,
  };
}
