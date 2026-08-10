/**
 * Drizzle repository for `ops_expense_links`.
 * Production path only when `OPS_FINANCE_PERSISTENCE_READY` is true.
 */

import { and, eq, inArray, isNull } from 'drizzle-orm';
import { opsExpenseLinks } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { OpsExpenseLink, OpsLinkPurpose, OpsRecordKind } from '../domain/types';

export interface OpsExpenseLinkInsert {
  readonly organizationId: string;
  readonly opsRecordKind: OpsRecordKind;
  readonly opsRecordId: string;
  readonly expenseId: string;
  readonly linkPurpose: OpsLinkPurpose;
  readonly createdByUserId: string | null;
}

export interface OpsExpenseLinksRepository {
  insert(db: DbExecutor, input: OpsExpenseLinkInsert): Promise<OpsExpenseLink>;
  findActiveForOpsRecord(
    db: DbExecutor,
    organizationId: string,
    opsRecordKind: OpsRecordKind,
    opsRecordId: string,
  ): Promise<OpsExpenseLink | null>;
  findActiveForExpense(
    db: DbExecutor,
    organizationId: string,
    expenseId: string,
  ): Promise<OpsExpenseLink | null>;
  listActiveForOpsRecords(
    db: DbExecutor,
    organizationId: string,
    opsRecordKind: OpsRecordKind,
    opsRecordIds: readonly string[],
  ): Promise<readonly OpsExpenseLink[]>;
  archive(
    db: DbExecutor,
    organizationId: string,
    linkId: string,
  ): Promise<OpsExpenseLink | null>;
}

function mapRow(row: typeof opsExpenseLinks.$inferSelect): OpsExpenseLink {
  return {
    id: row.id,
    organizationId: row.organizationId,
    opsRecordKind: row.opsRecordKind as OpsRecordKind,
    opsRecordId: row.opsRecordId,
    expenseId: row.expenseId,
    linkPurpose: row.linkPurpose as OpsLinkPurpose,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt,
    archivedAt: row.archivedAt,
  };
}

export const drizzleOpsExpenseLinksRepository: OpsExpenseLinksRepository = {
  async insert(db, input) {
    const [row] = await db
      .insert(opsExpenseLinks)
      .values({
        organizationId: input.organizationId,
        opsRecordKind: input.opsRecordKind,
        opsRecordId: input.opsRecordId,
        expenseId: input.expenseId,
        linkPurpose: input.linkPurpose,
        createdByUserId: input.createdByUserId,
      })
      .returning();
    if (!row) throw new Error('Failed to insert ops_expense_link');
    return mapRow(row);
  },

  async findActiveForOpsRecord(db, organizationId, opsRecordKind, opsRecordId) {
    const [row] = await db
      .select()
      .from(opsExpenseLinks)
      .where(
        and(
          eq(opsExpenseLinks.organizationId, organizationId),
          eq(opsExpenseLinks.opsRecordKind, opsRecordKind),
          eq(opsExpenseLinks.opsRecordId, opsRecordId),
          isNull(opsExpenseLinks.archivedAt),
        ),
      )
      .limit(1);
    return row ? mapRow(row) : null;
  },

  async findActiveForExpense(db, organizationId, expenseId) {
    const [row] = await db
      .select()
      .from(opsExpenseLinks)
      .where(
        and(
          eq(opsExpenseLinks.organizationId, organizationId),
          eq(opsExpenseLinks.expenseId, expenseId),
          isNull(opsExpenseLinks.archivedAt),
        ),
      )
      .limit(1);
    return row ? mapRow(row) : null;
  },

  async listActiveForOpsRecords(db, organizationId, opsRecordKind, opsRecordIds) {
    if (opsRecordIds.length === 0) return [];
    const rows = await db
      .select()
      .from(opsExpenseLinks)
      .where(
        and(
          eq(opsExpenseLinks.organizationId, organizationId),
          eq(opsExpenseLinks.opsRecordKind, opsRecordKind),
          inArray(opsExpenseLinks.opsRecordId, [...opsRecordIds]),
          isNull(opsExpenseLinks.archivedAt),
        ),
      );
    return rows.map(mapRow);
  },

  async archive(db, organizationId, linkId) {
    const now = new Date();
    const [row] = await db
      .update(opsExpenseLinks)
      .set({ archivedAt: now })
      .where(
        and(
          eq(opsExpenseLinks.organizationId, organizationId),
          eq(opsExpenseLinks.id, linkId),
          isNull(opsExpenseLinks.archivedAt),
        ),
      )
      .returning();
    return row ? mapRow(row) : null;
  },
};
