/**
 * Subcontract advance persistence.
 * Cash only — this table is never read by Recognized Actual loaders.
 */

import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { subcontractAdvances } from '@drizzle/schema';
import { fromNumericString, zeroMoney } from '@/shared/money';
import type { BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import type {
  CreateSubcontractAdvanceInput,
  SubcontractAdvanceRecord,
  SubcontractAdvanceStatus,
} from '../domain/subcontract-advances';
import { computeAdvanceOutstandingBalance } from '../domain/subcontract-advances';

function mapAdvance(row: typeof subcontractAdvances.$inferSelect): SubcontractAdvanceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    subcontractAgreementId: row.subcontractAgreementId,
    projectId: row.projectId,
    amount: row.amount,
    currency: row.currency,
    paidDate: row.paidDate,
    status: row.status as SubcontractAdvanceStatus,
    appliedAmount: row.appliedAmountCache,
    refundedAmount: row.refundedAmountCache,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    archivedAt: row.archivedAt,
  };
}

export async function listSubcontractAdvances(
  db: DbExecutor,
  orgId: string,
  agreementId: string,
): Promise<SubcontractAdvanceRecord[]> {
  const rows = await db
    .select()
    .from(subcontractAdvances)
    .where(
      and(
        eq(subcontractAdvances.organizationId, orgId),
        eq(subcontractAdvances.subcontractAgreementId, agreementId),
        isNull(subcontractAdvances.archivedAt),
      ),
    )
    .orderBy(desc(subcontractAdvances.paidDate), desc(subcontractAdvances.createdAt));

  return rows.map(mapAdvance);
}

export async function createSubcontractAdvance(
  db: DbExecutor,
  orgId: string,
  input: CreateSubcontractAdvanceInput & {
    readonly projectId: string;
    readonly currency: string;
  },
): Promise<SubcontractAdvanceRecord> {
  const status: SubcontractAdvanceStatus =
    input.status ?? (input.paidDate ? 'paid' : 'recorded');
  const [row] = await db
    .insert(subcontractAdvances)
    .values({
      organizationId: orgId,
      subcontractAgreementId: input.subcontractAgreementId,
      projectId: input.projectId,
      amount: input.amount,
      currency: input.currency.toUpperCase(),
      paidDate: input.paidDate ?? null,
      status,
      notes: input.notes ?? null,
    })
    .returning();

  return mapAdvance(row!);
}

export async function getAdvanceOutstandingBalance(
  db: DbExecutor,
  orgId: string,
  agreementId: string,
): Promise<{ paid: string; applied: string; outstanding: string; currency: string } | null> {
  const advances = await listSubcontractAdvances(db, orgId, agreementId);
  if (advances.length === 0) return null;
  return computeAdvanceOutstandingBalance(advances, advances[0]!.currency);
}

export async function sumPaidSubcontractAdvancesInDateRange(
  db: DbExecutor,
  orgId: string,
  currency: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<string> {
  const rows = await db
    .select({
      total: sql<string | null>`coalesce(sum(${subcontractAdvances.amount}), 0)::text`,
    })
    .from(subcontractAdvances)
    .where(
      and(
        eq(subcontractAdvances.organizationId, orgId),
        eq(subcontractAdvances.currency, currency.toUpperCase()),
        isNull(subcontractAdvances.archivedAt),
        inArray(subcontractAdvances.status, ['paid', 'partially_applied', 'fully_applied',
                                              'partially_refunded', 'fully_refunded']),
        gte(subcontractAdvances.paidDate, fromDate),
        lte(subcontractAdvances.paidDate, toDate),
      ),
    );

  return (
    fromNumericString(rows[0]?.total ?? '0', currency.toUpperCase()) ??
    zeroMoney(currency.toUpperCase())
  ).amount;
}
