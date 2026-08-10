/**
 * TEST DOUBLE ONLY — process-local ops↔expense link store.
 *
 * Not durable across processes/instances. Production default when
 * `OPS_FINANCE_PERSISTENCE_READY` is true uses Drizzle
 * (`ops-expense-links.repository.ts`). Do not treat this as durable storage.
 */

import { randomUUID } from 'node:crypto';
import type { OpsExpenseLink, OpsLinkPurpose, OpsRecordKind } from '../domain/types';

type OrgBucket = Map<string, OpsExpenseLink>;

const byOrg = new Map<string, OrgBucket>();

function bucket(organizationId: string): OrgBucket {
  let map = byOrg.get(organizationId);
  if (!map) {
    map = new Map();
    byOrg.set(organizationId, map);
  }
  return map;
}

export function resetOpsExpenseLinksStoreForTests(): void {
  byOrg.clear();
}

export function insertOpsExpenseLink(input: {
  readonly organizationId: string;
  readonly opsRecordKind: OpsRecordKind;
  readonly opsRecordId: string;
  readonly expenseId: string;
  readonly linkPurpose: OpsLinkPurpose;
  readonly createdByUserId: string | null;
}): OpsExpenseLink {
  const id = randomUUID();
  const link: OpsExpenseLink = {
    id,
    organizationId: input.organizationId,
    opsRecordKind: input.opsRecordKind,
    opsRecordId: input.opsRecordId,
    expenseId: input.expenseId,
    linkPurpose: input.linkPurpose,
    createdByUserId: input.createdByUserId,
    createdAt: new Date(),
    archivedAt: null,
  };
  bucket(input.organizationId).set(id, link);
  return link;
}

export function findActiveLinkForOpsRecord(
  organizationId: string,
  opsRecordKind: OpsRecordKind,
  opsRecordId: string,
): OpsExpenseLink | null {
  for (const link of bucket(organizationId).values()) {
    if (
      link.archivedAt == null &&
      link.opsRecordKind === opsRecordKind &&
      link.opsRecordId === opsRecordId
    ) {
      return link;
    }
  }
  return null;
}

export function findActiveLinkForExpense(
  organizationId: string,
  expenseId: string,
): OpsExpenseLink | null {
  for (const link of bucket(organizationId).values()) {
    if (link.archivedAt == null && link.expenseId === expenseId) {
      return link;
    }
  }
  return null;
}

export function listActiveLinksForOpsRecords(
  organizationId: string,
  opsRecordKind: OpsRecordKind,
  opsRecordIds: readonly string[],
): readonly OpsExpenseLink[] {
  const want = new Set(opsRecordIds);
  const out: OpsExpenseLink[] = [];
  for (const link of bucket(organizationId).values()) {
    if (
      link.archivedAt == null &&
      link.opsRecordKind === opsRecordKind &&
      want.has(link.opsRecordId)
    ) {
      out.push(link);
    }
  }
  return out;
}

export function archiveOpsExpenseLink(
  organizationId: string,
  linkId: string,
): OpsExpenseLink | null {
  const map = bucket(organizationId);
  const existing = map.get(linkId);
  if (!existing || existing.archivedAt) return null;
  const archived: OpsExpenseLink = { ...existing, archivedAt: new Date() };
  map.set(linkId, archived);
  return archived;
}
