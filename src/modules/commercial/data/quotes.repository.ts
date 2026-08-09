import { and, asc, desc, eq, sql } from 'drizzle-orm';
import {
  approvals,
  changeOrders,
  quoteVersionLines,
  quoteVersions,
  quotes,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { ConflictError } from '@/shared/errors';
import type {
  ChangeOrderRecord,
  QuoteRecord,
  QuoteVersionLineRecord,
  QuoteVersionRecord,
} from '../domain/types';

function mapQuote(row: typeof quotes.$inferSelect): QuoteRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    changeRequestId: row.changeRequestId,
    title: row.title,
    currency: row.currency,
  };
}

function mapQuoteVersion(row: typeof quoteVersions.$inferSelect): QuoteVersionRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    quoteId: row.quoteId,
    versionNumber: row.versionNumber,
    status: row.status,
    subtotalAmount: row.subtotalAmount,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    currency: row.currency,
    validUntil: row.validUntil,
    issuedAt: row.issuedAt,
    isSelected: row.isSelected,
    notes: row.notes,
  };
}

export async function findQuoteForChangeRequest(
  db: DbExecutor,
  organizationId: string,
  changeRequestId: string,
): Promise<QuoteRecord | null> {
  const [row] = await db
    .select()
    .from(quotes)
    .where(
      and(eq(quotes.organizationId, organizationId), eq(quotes.changeRequestId, changeRequestId)),
    )
    .limit(1);

  return row ? mapQuote(row) : null;
}

export async function insertQuote(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    changeRequestId: string;
    title?: string | null;
    currency: string;
  },
): Promise<QuoteRecord> {
  const [row] = await db
    .insert(quotes)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      changeRequestId: input.changeRequestId,
      title: input.title ?? null,
      currency: input.currency,
    })
    .returning();

  return mapQuote(row!);
}

export async function listQuoteVersions(
  db: DbExecutor,
  organizationId: string,
  quoteId: string,
): Promise<QuoteVersionRecord[]> {
  const rows = await db
    .select()
    .from(quoteVersions)
    .where(and(eq(quoteVersions.organizationId, organizationId), eq(quoteVersions.quoteId, quoteId)))
    .orderBy(desc(quoteVersions.versionNumber));

  return rows.map(mapQuoteVersion);
}

export async function findQuoteVersionById(
  db: DbExecutor,
  organizationId: string,
  quoteVersionId: string,
): Promise<QuoteVersionRecord | null> {
  const [row] = await db
    .select()
    .from(quoteVersions)
    .where(
      and(eq(quoteVersions.id, quoteVersionId), eq(quoteVersions.organizationId, organizationId)),
    )
    .limit(1);

  return row ? mapQuoteVersion(row) : null;
}

export async function nextQuoteVersionNumber(
  db: DbExecutor,
  organizationId: string,
  quoteId: string,
): Promise<number> {
  const [result] = await db
    .select({ max: sql<number | null>`max(${quoteVersions.versionNumber})::int` })
    .from(quoteVersions)
    .where(and(eq(quoteVersions.organizationId, organizationId), eq(quoteVersions.quoteId, quoteId)));

  return (result?.max ?? 0) + 1;
}

export async function insertQuoteVersion(
  db: DbExecutor,
  input: {
    organizationId: string;
    quoteId: string;
    versionNumber: number;
    subtotalAmount: string;
    taxAmount?: string | null;
    totalAmount: string;
    currency: string;
    validUntil?: string | null;
    notes?: string | null;
  },
): Promise<QuoteVersionRecord> {
  const [row] = await db
    .insert(quoteVersions)
    .values({
      organizationId: input.organizationId,
      quoteId: input.quoteId,
      versionNumber: input.versionNumber,
      status: 'draft',
      subtotalAmount: input.subtotalAmount,
      taxAmount: input.taxAmount ?? null,
      totalAmount: input.totalAmount,
      currency: input.currency,
      validUntil: input.validUntil ?? null,
      notes: input.notes ?? null,
    })
    .returning();

  return mapQuoteVersion(row!);
}

export async function updateQuoteVersion(
  db: DbExecutor,
  organizationId: string,
  quoteVersionId: string,
  patch: Partial<{
    status: QuoteVersionRecord['status'];
    subtotalAmount: string;
    taxAmount: string | null;
    totalAmount: string;
    validUntil: string | null;
    issuedAt: Date | null;
    isSelected: boolean;
    notes: string | null;
  }>,
): Promise<QuoteVersionRecord | null> {
  const [row] = await db
    .update(quoteVersions)
    .set(patch)
    .where(
      and(eq(quoteVersions.id, quoteVersionId), eq(quoteVersions.organizationId, organizationId)),
    )
    .returning();

  return row ? mapQuoteVersion(row) : null;
}

export async function clearSelectedQuoteVersions(
  db: DbExecutor,
  organizationId: string,
  quoteId: string,
): Promise<void> {
  await db
    .update(quoteVersions)
    .set({ isSelected: false })
    .where(and(eq(quoteVersions.organizationId, organizationId), eq(quoteVersions.quoteId, quoteId)));
}

export async function supersedeIssuedVersions(
  db: DbExecutor,
  organizationId: string,
  quoteId: string,
  exceptVersionId: string,
): Promise<void> {
  await db
    .update(quoteVersions)
    .set({ status: 'superseded', isSelected: false })
    .where(
      and(
        eq(quoteVersions.organizationId, organizationId),
        eq(quoteVersions.quoteId, quoteId),
        sql`${quoteVersions.id} <> ${exceptVersionId}`,
        sql`${quoteVersions.status} in ('issued', 'accepted')`,
      ),
    );
}

export async function listQuoteVersionLines(
  db: DbExecutor,
  organizationId: string,
  quoteVersionId: string,
): Promise<QuoteVersionLineRecord[]> {
  const rows = await db
    .select()
    .from(quoteVersionLines)
    .where(
      and(
        eq(quoteVersionLines.quoteVersionId, quoteVersionId),
        eq(quoteVersionLines.organizationId, organizationId),
      ),
    )
    .orderBy(asc(quoteVersionLines.sortOrder));

  return rows.map((row) => ({
    id: row.id,
    quoteVersionId: row.quoteVersionId,
    description: row.description,
    quantityEntered: row.quantityEntered,
    unitEntered: row.unitEntered,
    unitPrice: row.unitPrice,
    lineTotal: row.lineTotal,
    currency: row.currency,
    sortOrder: row.sortOrder,
  }));
}

export async function replaceQuoteVersionLines(
  db: DbExecutor,
  organizationId: string,
  quoteVersionId: string,
  lines: readonly {
    description: string;
    quantityEntered?: string | null;
    unitEntered?: string | null;
    unitPrice?: string | null;
    lineTotal: string;
    currency: string;
    sortOrder: number;
  }[],
): Promise<void> {
  await db
    .delete(quoteVersionLines)
    .where(
      and(
        eq(quoteVersionLines.quoteVersionId, quoteVersionId),
        eq(quoteVersionLines.organizationId, organizationId),
      ),
    );

  if (lines.length === 0) return;

  await db.insert(quoteVersionLines).values(
    lines.map((line) => ({
      organizationId,
      quoteVersionId,
      description: line.description,
      quantityEntered: line.quantityEntered ?? null,
      unitEntered: line.unitEntered ?? null,
      unitPrice: line.unitPrice ?? null,
      lineTotal: line.lineTotal,
      currency: line.currency,
      sortOrder: line.sortOrder,
    })),
  );
}

export async function findSelectedQuoteVersionForChangeRequest(
  db: DbExecutor,
  organizationId: string,
  changeRequestId: string,
): Promise<QuoteVersionRecord | null> {
  const [row] = await db
    .select({ version: quoteVersions })
    .from(quotes)
    .innerJoin(quoteVersions, eq(quoteVersions.quoteId, quotes.id))
    .where(
      and(
        eq(quotes.organizationId, organizationId),
        eq(quotes.changeRequestId, changeRequestId),
        eq(quoteVersions.isSelected, true),
      ),
    )
    .limit(1);

  return row ? mapQuoteVersion(row.version) : null;
}

export async function insertApproval(
  db: DbExecutor,
  input: {
    organizationId: string;
    targetType: 'change_request' | 'quote_version';
    targetId: string;
    decision: 'approved' | 'rejected';
    approverName?: string | null;
    approverUserId?: string | null;
    recordedByUserId: string;
    decidedAt: Date;
    notes?: string | null;
    evidenceDocumentId?: string | null;
  },
): Promise<string> {
  const [row] = await db
    .insert(approvals)
    .values({
      organizationId: input.organizationId,
      targetType: input.targetType,
      targetId: input.targetId,
      decision: input.decision,
      approverName: input.approverName ?? null,
      approverUserId: input.approverUserId ?? null,
      recordedByUserId: input.recordedByUserId,
      decidedAt: input.decidedAt,
      notes: input.notes ?? null,
      evidenceDocumentId: input.evidenceDocumentId ?? null,
    })
    .returning({ id: approvals.id });

  return row!.id;
}

function mapChangeOrder(row: typeof changeOrders.$inferSelect): ChangeOrderRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    contractId: row.contractId,
    changeRequestId: row.changeRequestId,
    quoteVersionId: row.quoteVersionId,
    approvalId: row.approvalId,
    reference: row.reference,
    direction: row.direction,
    amount: row.amount,
    currency: row.currency,
    effectiveDate: row.effectiveDate,
    notes: row.notes,
  };
}

export async function findChangeOrderByChangeRequest(
  db: DbExecutor,
  organizationId: string,
  changeRequestId: string,
): Promise<ChangeOrderRecord | null> {
  const [row] = await db
    .select()
    .from(changeOrders)
    .where(
      and(
        eq(changeOrders.organizationId, organizationId),
        eq(changeOrders.changeRequestId, changeRequestId),
      ),
    )
    .limit(1);

  return row ? mapChangeOrder(row) : null;
}

export async function nextChangeOrderReference(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<string> {
  const rows = await db
    .select({ reference: changeOrders.reference })
    .from(changeOrders)
    .where(and(eq(changeOrders.organizationId, organizationId), eq(changeOrders.projectId, projectId)));

  let max = 0;
  for (const row of rows) {
    if (!row.reference) continue;
    const match = /^CO-(\d+)$/.exec(row.reference);
    if (match) {
      max = Math.max(max, Number.parseInt(match[1]!, 10));
    }
  }

  return `CO-${String(max + 1).padStart(3, '0')}`;
}

function isPostgresUniqueViolation(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    (error as { code: string }).code === '23505'
  );
}

export async function insertChangeOrderWithProjectReference(
  db: DbExecutor,
  input: Omit<Parameters<typeof insertChangeOrder>[1], 'reference'>,
  organizationId: string,
  projectId: string,
): Promise<ChangeOrderRecord> {
  const maxAttempts = 5;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const reference = await nextChangeOrderReference(db, organizationId, projectId);
    try {
      return await insertChangeOrder(db, { ...input, reference });
    } catch (error) {
      if (!isPostgresUniqueViolation(error) || attempt === maxAttempts - 1) {
        throw error;
      }
    }
  }

  throw new ConflictError(
    'Could not allocate a unique change order reference',
    'changes.errors.referenceConflict',
  );
}

export async function insertChangeOrder(
  db: DbExecutor,
  input: {
    organizationId: string;
    projectId: string;
    contractId: string;
    changeRequestId: string;
    quoteVersionId?: string | null;
    approvalId: string;
    reference: string;
    direction: ChangeOrderRecord['direction'];
    amount: string;
    currency: string;
    effectiveDate: string;
    notes?: string | null;
  },
): Promise<ChangeOrderRecord> {
  const [row] = await db
    .insert(changeOrders)
    .values({
      organizationId: input.organizationId,
      projectId: input.projectId,
      contractId: input.contractId,
      changeRequestId: input.changeRequestId,
      quoteVersionId: input.quoteVersionId ?? null,
      approvalId: input.approvalId,
      reference: input.reference,
      direction: input.direction,
      amount: input.amount,
      currency: input.currency,
      effectiveDate: input.effectiveDate,
      notes: input.notes ?? null,
    })
    .returning();

  return mapChangeOrder(row!);
}
