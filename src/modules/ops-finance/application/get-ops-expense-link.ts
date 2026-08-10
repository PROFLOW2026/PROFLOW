import type { OrgContext } from '@/shared/auth/context';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import {
  findActiveLinkForExpenseRow,
  findActiveLinkForOpsRecordRow,
  listActiveLinksForOpsRecordsRow,
} from '../data/ops-expense-links';
import type { OpsExpenseLink, OpsRecordKind } from '../domain/types';

export async function getActiveOpsExpenseLink(
  context: OrgContext,
  opsRecordKind: OpsRecordKind,
  opsRecordId: string,
): Promise<OpsExpenseLink | null> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  return findActiveLinkForOpsRecordRow(context, opsRecordKind, opsRecordId);
}

export async function getOpsExpenseLinkByExpenseId(
  context: OrgContext,
  expenseId: string,
): Promise<OpsExpenseLink | null> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  return findActiveLinkForExpenseRow(context, expenseId);
}

export async function listOpsExpenseLinksForRecords(
  context: OrgContext,
  opsRecordKind: OpsRecordKind,
  opsRecordIds: readonly string[],
): Promise<readonly OpsExpenseLink[]> {
  assertPermission(context, PERMISSIONS.EXPENSES_READ);
  return listActiveLinksForOpsRecordsRow(context, opsRecordKind, opsRecordIds);
}

/** Read without permission assert — for UI composition after caller checked access. */
export async function peekOpsExpenseLinksForRecords(
  context: Pick<OrgContext, 'db' | 'organizationId'>,
  opsRecordKind: OpsRecordKind,
  opsRecordIds: readonly string[],
): Promise<readonly OpsExpenseLink[]> {
  return listActiveLinksForOpsRecordsRow(context, opsRecordKind, opsRecordIds);
}
