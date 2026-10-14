import { and, eq, gte, isNull, lte, ne } from 'drizzle-orm';
import { apBills, documents, expenses } from '@drizzle/schema';
import { addDays, type BusinessDate } from '@/shared/dates';
import type { DbExecutor } from '@/shared/db/types';
import type { DuplicateIndexRow } from '../domain/duplicates';

const DUPLICATE_WINDOW_DAYS = 60;
const ROW_LIMIT = 200;

export interface DuplicateIndexProbe {
  readonly vendorId?: string | null;
  readonly amount?: string | null;
  readonly currency?: string | null;
  readonly date?: string | null;
  readonly checksumSha256?: string | null;
}

function probeDateWindow(probe: DuplicateIndexProbe): { from: BusinessDate; to: BusinessDate } | null {
  if (!probe.date || !/^\d{4}-\d{2}-\d{2}$/.test(probe.date)) return null;
  const anchor = probe.date as BusinessDate;
  return {
    from: addDays(anchor, -DUPLICATE_WINDOW_DAYS),
    to: addDays(anchor, DUPLICATE_WINDOW_DAYS),
  };
}

export async function loadDuplicateIndex(
  db: DbExecutor | null | undefined,
  organizationId: string,
  probe: DuplicateIndexProbe = {},
): Promise<DuplicateIndexRow[]> {
  if (!db || typeof (db as { select?: unknown }).select !== 'function') return [];

  const window = probeDateWindow(probe);
  const expenseFilters = [
    eq(expenses.organizationId, organizationId),
    isNull(expenses.archivedAt),
    ne(expenses.status, 'void'),
  ];
  if (window) {
    expenseFilters.push(gte(expenses.expenseDate, window.from), lte(expenses.expenseDate, window.to));
  }
  if (probe.vendorId) {
    expenseFilters.push(eq(expenses.vendorId, probe.vendorId));
  }

  const billFilters = [
    eq(apBills.organizationId, organizationId),
    isNull(apBills.archivedAt),
  ];
  if (window) {
    billFilters.push(gte(apBills.billDate, window.from), lte(apBills.billDate, window.to));
  }
  if (probe.vendorId) {
    billFilters.push(eq(apBills.vendorId, probe.vendorId));
  }

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
    .where(and(...expenseFilters))
    .limit(ROW_LIMIT);

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
    .where(and(...billFilters))
    .limit(ROW_LIMIT);

  let documentRows: { id: string; checksum: string | null }[] = [];
  if (probe.checksumSha256) {
    documentRows = await db
      .select({
        id: documents.id,
        checksum: documents.checksum,
      })
      .from(documents)
      .where(
        and(
          eq(documents.organizationId, organizationId),
          isNull(documents.deletedAt),
          eq(documents.checksum, probe.checksumSha256),
        ),
      )
      .limit(ROW_LIMIT);
  }

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
