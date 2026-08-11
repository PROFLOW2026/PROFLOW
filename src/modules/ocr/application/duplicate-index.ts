import { and, eq, isNull } from 'drizzle-orm';
import { apBills, documents, expenses } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { DuplicateIndexRow } from '../domain/duplicates';

export async function loadDuplicateIndex(
  db: DbExecutor | null | undefined,
  organizationId: string,
): Promise<DuplicateIndexRow[]> {
  if (!db || typeof (db as { select?: unknown }).select !== 'function') return [];

  const expenseRows = await db
    .select({
      id: expenses.id,
      vendorId: expenses.vendorId,
      vendorName: expenses.supplierName,
      date: expenses.expenseDate,
      amount: expenses.grossAmount,
      currency: expenses.currency,
    })
    .from(expenses)
    .where(and(eq(expenses.organizationId, organizationId), isNull(expenses.archivedAt)));

  const billRows = await db
    .select({
      id: apBills.id,
      vendorId: apBills.vendorId,
      reference: apBills.reference,
      date: apBills.billDate,
      amount: apBills.totalAmount,
      currency: apBills.currency,
    })
    .from(apBills)
    .where(and(eq(apBills.organizationId, organizationId), isNull(apBills.archivedAt)));

  const documentRows = await db
    .select({
      id: documents.id,
      checksum: documents.checksum,
    })
    .from(documents)
    .where(and(eq(documents.organizationId, organizationId), isNull(documents.deletedAt)));

  return [
    ...expenseRows.map((row) => ({
      kind: 'expense' as const,
      id: row.id,
      vendorId: row.vendorId,
      vendorName: row.vendorName,
      date: row.date,
      amount: row.amount,
      currency: row.currency,
    })),
    ...billRows.map((row) => ({
      kind: 'vendor_bill' as const,
      id: row.id,
      vendorId: row.vendorId,
      reference: row.reference,
      date: row.date,
      amount: row.amount,
      currency: row.currency,
    })),
    ...documentRows.map((row) => ({
      kind: 'document' as const,
      id: row.id,
      checksumSha256: row.checksum,
      documentId: row.id,
    })),
  ];
}
