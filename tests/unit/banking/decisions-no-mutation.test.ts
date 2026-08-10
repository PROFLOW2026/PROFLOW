import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DomainRuleError } from '@/shared/errors';
import {
  assertBankMatchDoesNotCreateProjectCost,
  assertBankMatchDoesNotMutateFinancials,
  isBankMatchCreatingProjectCost,
  isBankMatchRecognizedActual,
  shouldRecognizeBankTxnAsProjectCost,
} from '@/modules/banking/domain/cost-guard';
import { buildBankMatchDecision } from '@/modules/banking/domain/decisions';
import {
  createBankAccount,
  createBankingTestDoubleRepository,
  decideBankMatch,
  importBankStatement,
  resetBankingRepository,
  resetBankingStoreForTests,
  setBankingPersistenceReadyForTests,
  setBankingRepository,
} from '@/modules/banking';
import type { OrgContext } from '@/shared/auth/context';
import type { DbExecutor } from '@/shared/db/types';

function testContext(): OrgContext {
  return {
    userId: 'user-1',
    organizationId: 'org-bank-1',
    membershipId: 'mem-1',
    roleKeys: ['admin'],
    permissions: new Set([
      'banking.read',
      'banking.manage',
      'billing.read',
      'billing.manage',
    ]),
    organization: {
      id: 'org-bank-1',
      name: 'Bank Test Org',
      baseCurrency: 'ILS',
      timezone: 'Asia/Jerusalem',
      countryCode: 'IL',
      defaultLocale: 'he-IL',
    },
    db: {} as DbExecutor,
    locale: 'en',
  };
}

describe('bank match decisions — no silent mutation', () => {
  beforeEach(() => {
    resetBankingStoreForTests();
    setBankingPersistenceReadyForTests(true);
    setBankingRepository(createBankingTestDoubleRepository());
  });

  afterEach(() => {
    setBankingPersistenceReadyForTests(null);
    resetBankingRepository();
    resetBankingStoreForTests();
  });

  it('never treats bank match as Actual Cost or project cost', () => {
    expect(isBankMatchRecognizedActual()).toBe(false);
    expect(isBankMatchCreatingProjectCost()).toBe(false);
    expect(
      shouldRecognizeBankTxnAsProjectCost({
        targetKind: 'vendor_payment',
        billAlreadyRecognized: true,
      }),
    ).toBe(false);
    expect(() => assertBankMatchDoesNotMutateFinancials()).not.toThrow();
    expect(() =>
      assertBankMatchDoesNotCreateProjectCost({
        targetKind: 'vendor_payment',
        billAlreadyRecognized: true,
      }),
    ).not.toThrow();
  });

  it('approve records reconciliation intent without financial mutation', () => {
    const result = buildBankMatchDecision({
      organizationId: 'org-1',
      bankTransactionId: 'txn-1',
      decision: 'approve',
      targetKind: 'vendor_payment',
      targetId: 'vp-1',
      appliedAmount: '80',
      currency: 'ILS',
      txnDirection: 'debit',
      txnAmount: '100',
      txnCurrency: 'ILS',
      billAlreadyRecognized: true,
    });

    expect(result.financialMutationPerformed).toBe(false);
    expect(result.decision.mutatesFinancials).toBe(false);
    expect(result.decision.createsProjectCost).toBe(false);
    expect(result.nextMatchStatus).toBe('partially_matched');
  });

  it('ignore sets ignored without a target', () => {
    const result = buildBankMatchDecision({
      organizationId: 'org-1',
      bankTransactionId: 'txn-1',
      decision: 'ignore',
      txnDirection: 'credit',
      txnAmount: '10',
      txnCurrency: 'ILS',
    });
    expect(result.nextMatchStatus).toBe('ignored');
    expect(result.decision.targetId).toBeNull();
    expect(result.financialMutationPerformed).toBe(false);
  });

  it('rejects approve without target and wrong direction target', () => {
    expect(() =>
      buildBankMatchDecision({
        organizationId: 'org-1',
        bankTransactionId: 'txn-1',
        decision: 'approve',
        txnDirection: 'credit',
        txnAmount: '10',
        txnCurrency: 'ILS',
      }),
    ).toThrow(DomainRuleError);

    expect(() =>
      buildBankMatchDecision({
        organizationId: 'org-1',
        bankTransactionId: 'txn-1',
        decision: 'approve',
        targetKind: 'vendor_bill',
        targetId: 'vb-1',
        txnDirection: 'credit',
        txnAmount: '10',
        txnCurrency: 'ILS',
      }),
    ).toThrow(DomainRuleError);
  });

  it('import + decide path never reports financial mutation', async () => {
    const ctx = testContext();
    const account = await createBankAccount(ctx, {
      name: 'Main',
      currency: 'ILS',
    });

    const csv = [
      'date,description,amount,reference',
      '2026-08-01,Supplier payment,-120.00,VP-1',
      '2026-08-01,Supplier payment,-120.00,VP-1',
    ].join('\n');

    const imported = await importBankStatement(ctx, {
      bankAccountId: account.id,
      csvText: csv,
      source: 'csv_import',
    });

    expect(imported.financialMutationPerformed).toBe(false);
    expect(imported.imported).toHaveLength(1);
    expect(imported.skippedDuplicates).toBe(1);

    const txn = imported.imported[0]!;
    const decided = await decideBankMatch(ctx, {
      bankTransactionId: txn.id,
      decision: 'approve',
      targetKind: 'vendor_payment',
      targetId: 'vp-existing',
      appliedAmount: txn.amount,
      currency: 'ILS',
      billAlreadyRecognized: true,
    });

    expect(decided.financialMutationPerformed).toBe(false);
    expect(decided.decision.createsProjectCost).toBe(false);
    expect(decided.transaction.matchStatus).toBe('matched');
  });

  it('fails closed with schemaPending when readiness is off', async () => {
    setBankingPersistenceReadyForTests(false);
    resetBankingRepository();
    const ctx = testContext();
    await expect(
      createBankAccount(ctx, { name: 'Blocked', currency: 'ILS' }),
    ).rejects.toMatchObject({ messageKey: 'banking.errors.schemaPending' });
  });
});
