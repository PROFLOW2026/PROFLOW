/**
 * Ops expense link persistence facade.
 * Drizzle when ready; otherwise TEST DOUBLE in-memory store (non-durable).
 */

import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError } from '@/shared/errors';
import { areOpsFinanceLinksAvailable } from '../domain/persistence';
import { assertExpenseSameOrg, assertOpsRecordSameOrg } from './same-org-guards';
import type { OpsExpenseLink } from '../domain/types';
import {
  archiveOpsExpenseLink as archiveInMemory,
  findActiveLinkForExpense as findExpenseInMemory,
  findActiveLinkForOpsRecord as findOpsInMemory,
  insertOpsExpenseLink as insertInMemory,
  listActiveLinksForOpsRecords as listInMemory,
} from './ops-expense-links.store';
import {
  drizzleOpsExpenseLinksRepository,
  type OpsExpenseLinkInsert,
  type OpsExpenseLinksRepository,
} from './ops-expense-links.repository';

let activeRepository: OpsExpenseLinksRepository | null = null;

export function setOpsExpenseLinksRepositoryForTests(
  repo: OpsExpenseLinksRepository | null,
): void {
  activeRepository = repo;
}

export function getOpsExpenseLinksRepository(): OpsExpenseLinksRepository {
  if (activeRepository) return activeRepository;
  return drizzleOpsExpenseLinksRepository;
}

export async function insertOpsExpenseLinkRow(
  context: OrgContext,
  input: Omit<OpsExpenseLinkInsert, 'organizationId'> & { organizationId?: string },
): Promise<OpsExpenseLink> {
  const organizationId = input.organizationId ?? context.organizationId;
  if (organizationId !== context.organizationId) {
    throw new DomainRuleError(
      'Organization mismatch for ops expense link',
      'opsFinance.errors.orgMismatch',
    );
  }

  if (areOpsFinanceLinksAvailable()) {
    // APP GUARDS — durable path only (PGlite / production after 0020).
    await assertOpsRecordSameOrg(context, input.opsRecordKind, input.opsRecordId);
    await assertExpenseSameOrg(context.db, organizationId, input.expenseId);
    return getOpsExpenseLinksRepository().insert(context.db, {
      organizationId,
      opsRecordKind: input.opsRecordKind,
      opsRecordId: input.opsRecordId,
      expenseId: input.expenseId,
      linkPurpose: input.linkPurpose,
      createdByUserId: input.createdByUserId,
    });
  }

  // TEST DOUBLE path — no DB round-trips; callers still load ops via application.
  return insertInMemory({
    organizationId,
    opsRecordKind: input.opsRecordKind,
    opsRecordId: input.opsRecordId,
    expenseId: input.expenseId,
    linkPurpose: input.linkPurpose,
    createdByUserId: input.createdByUserId,
  });
}

export async function findActiveLinkForOpsRecordRow(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  opsRecordKind: OpsExpenseLink['opsRecordKind'],
  opsRecordId: string,
): Promise<OpsExpenseLink | null> {
  if (areOpsFinanceLinksAvailable()) {
    return getOpsExpenseLinksRepository().findActiveForOpsRecord(
      context.db,
      context.organizationId,
      opsRecordKind,
      opsRecordId,
    );
  }
  return findOpsInMemory(context.organizationId, opsRecordKind, opsRecordId);
}

export async function findActiveLinkForExpenseRow(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  expenseId: string,
): Promise<OpsExpenseLink | null> {
  if (areOpsFinanceLinksAvailable()) {
    return getOpsExpenseLinksRepository().findActiveForExpense(
      context.db,
      context.organizationId,
      expenseId,
    );
  }
  return findExpenseInMemory(context.organizationId, expenseId);
}

export async function listActiveLinksForOpsRecordsRow(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  opsRecordKind: OpsExpenseLink['opsRecordKind'],
  opsRecordIds: readonly string[],
): Promise<readonly OpsExpenseLink[]> {
  if (areOpsFinanceLinksAvailable()) {
    return getOpsExpenseLinksRepository().listActiveForOpsRecords(
      context.db,
      context.organizationId,
      opsRecordKind,
      opsRecordIds,
    );
  }
  return listInMemory(context.organizationId, opsRecordKind, opsRecordIds);
}

export async function archiveOpsExpenseLinkRow(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  linkId: string,
): Promise<OpsExpenseLink | null> {
  if (areOpsFinanceLinksAvailable()) {
    return getOpsExpenseLinksRepository().archive(context.db, context.organizationId, linkId);
  }
  return archiveInMemory(context.organizationId, linkId);
}

export type { OpsExpenseLinkInsert, OpsExpenseLinksRepository };
