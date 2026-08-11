import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { clients } from '@drizzle/schema';
import { estimateLineItems, estimates } from '@drizzle/schema/next-gen';
import type { DbExecutor } from '@/shared/db/types';
import type {
  QuoteDetail,
  QuoteLineItemRecord,
  QuoteListItem,
  QuoteRecord,
  QuoteStatus,
  QuoteTaxMode,
} from '../domain/types';

function mapQuote(row: typeof estimates.$inferSelect): QuoteRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    clientId: row.clientId,
    contactId: row.contactId,
    title: row.title,
    description: row.description,
    status: row.status as QuoteStatus,
    currency: row.currency,
    taxMode: row.taxMode as QuoteTaxMode,
    taxRuleId: row.taxRuleId,
    validityDate: row.validityDate,
    notes: row.notes,
    subtotalAmount: row.subtotalAmount,
    taxAmount: row.taxAmount,
    totalAmount: row.totalAmount,
    estimatedCostAmount: row.estimatedCostAmount,
    estimatedMarginPercent: row.estimatedMarginPercent,
    convertedProjectId: row.convertedProjectId,
    convertedAt: row.convertedAt,
    sentAt: row.sentAt,
    decidedAt: row.decidedAt,
    createdByUserId: row.createdByUserId,
    archivedAt: row.archivedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLine(row: typeof estimateLineItems.$inferSelect): QuoteLineItemRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    quoteId: row.estimateId,
    sortOrder: row.sortOrder,
    description: row.description,
    quantity: row.quantity,
    unit: row.unit,
    unitPriceAmount: row.unitPriceAmount,
    estimatedUnitCostAmount: row.estimatedUnitCostAmount,
    lineTotalAmount: row.lineTotalAmount,
    notes: row.notes,
  };
}

export async function listQuotes(
  db: DbExecutor,
  organizationId: string,
  filters: { status?: QuoteStatus; clientId?: string } = {},
): Promise<QuoteListItem[]> {
  const conditions = [eq(estimates.organizationId, organizationId), isNull(estimates.archivedAt)];
  if (filters.status) conditions.push(eq(estimates.status, filters.status));
  if (filters.clientId) conditions.push(eq(estimates.clientId, filters.clientId));

  const rows = await db
    .select({
      id: estimates.id,
      title: estimates.title,
      status: estimates.status,
      currency: estimates.currency,
      totalAmount: estimates.totalAmount,
      clientId: estimates.clientId,
      clientName: clients.name,
      validityDate: estimates.validityDate,
      updatedAt: estimates.updatedAt,
      convertedProjectId: estimates.convertedProjectId,
    })
    .from(estimates)
    .leftJoin(
      clients,
      and(eq(clients.id, estimates.clientId), eq(clients.organizationId, organizationId)),
    )
    .where(and(...conditions))
    .orderBy(desc(estimates.updatedAt));

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    status: row.status as QuoteStatus,
    currency: row.currency,
    totalAmount: row.totalAmount,
    clientId: row.clientId,
    clientName: row.clientName ?? null,
    validityDate: row.validityDate,
    updatedAt: row.updatedAt,
    convertedProjectId: row.convertedProjectId,
  }));
}

export async function findQuoteById(
  db: DbExecutor,
  organizationId: string,
  quoteId: string,
): Promise<QuoteRecord | null> {
  const [row] = await db
    .select()
    .from(estimates)
    .where(
      and(eq(estimates.id, quoteId), eq(estimates.organizationId, organizationId), isNull(estimates.archivedAt)),
    )
    .limit(1);
  return row ? mapQuote(row) : null;
}

export async function findQuoteDetail(
  db: DbExecutor,
  organizationId: string,
  quoteId: string,
): Promise<QuoteDetail | null> {
  const quote = await findQuoteById(db, organizationId, quoteId);
  if (!quote) return null;

  const lines = await listQuoteLines(db, organizationId, quoteId);
  let clientName: string | null = null;
  if (quote.clientId) {
    const [client] = await db
      .select({ name: clients.name })
      .from(clients)
      .where(and(eq(clients.id, quote.clientId), eq(clients.organizationId, organizationId)))
      .limit(1);
    clientName = client?.name ?? null;
  }

  return { ...quote, lines, clientName };
}

export async function listQuoteLines(
  db: DbExecutor,
  organizationId: string,
  quoteId: string,
): Promise<QuoteLineItemRecord[]> {
  const rows = await db
    .select()
    .from(estimateLineItems)
    .where(
      and(eq(estimateLineItems.estimateId, quoteId), eq(estimateLineItems.organizationId, organizationId)),
    )
    .orderBy(asc(estimateLineItems.sortOrder), asc(estimateLineItems.createdAt));
  return rows.map(mapLine);
}

export async function insertQuote(
  db: DbExecutor,
  values: typeof estimates.$inferInsert,
): Promise<QuoteRecord> {
  const [row] = await db.insert(estimates).values(values).returning();
  if (!row) throw new Error('Failed to insert quote');
  return mapQuote(row);
}

export async function updateQuoteById(
  db: DbExecutor,
  organizationId: string,
  quoteId: string,
  patch: Partial<typeof estimates.$inferInsert>,
): Promise<QuoteRecord | null> {
  const [row] = await db
    .update(estimates)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(estimates.id, quoteId), eq(estimates.organizationId, organizationId)))
    .returning();
  return row ? mapQuote(row) : null;
}

/**
 * Atomic convert claim: only accepted quotes with no prior conversion win.
 * Prevents double-convert races from creating two projects for one quote.
 */
export async function markQuoteConvertedIfAccepted(
  db: DbExecutor,
  organizationId: string,
  quoteId: string,
  input: {
    readonly convertedProjectId: string;
    readonly convertedAt: Date;
    readonly decidedAt: Date | null;
  },
): Promise<QuoteRecord | null> {
  const [row] = await db
    .update(estimates)
    .set({
      status: 'converted',
      convertedProjectId: input.convertedProjectId,
      convertedAt: input.convertedAt,
      decidedAt: input.decidedAt ?? input.convertedAt,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(estimates.id, quoteId),
        eq(estimates.organizationId, organizationId),
        eq(estimates.status, 'accepted'),
        isNull(estimates.convertedProjectId),
        isNull(estimates.convertedAt),
      ),
    )
    .returning();
  return row ? mapQuote(row) : null;
}

export async function replaceQuoteLines(
  db: DbExecutor,
  organizationId: string,
  quoteId: string,
  lines: readonly {
    description: string;
    quantity: string;
    unit: string | null;
    unitPriceAmount: string;
    estimatedUnitCostAmount: string | null;
    lineTotalAmount: string;
    notes: string | null;
    sortOrder: number;
  }[],
): Promise<QuoteLineItemRecord[]> {
  await db
    .delete(estimateLineItems)
    .where(
      and(eq(estimateLineItems.estimateId, quoteId), eq(estimateLineItems.organizationId, organizationId)),
    );

  if (lines.length === 0) return [];

  const inserted = await db
    .insert(estimateLineItems)
    .values(
      lines.map((line) => ({
        organizationId,
        estimateId: quoteId,
        sortOrder: line.sortOrder,
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPriceAmount: line.unitPriceAmount,
        estimatedUnitCostAmount: line.estimatedUnitCostAmount,
        lineTotalAmount: line.lineTotalAmount,
        notes: line.notes,
      })),
    )
    .returning();

  return inserted.map(mapLine);
}
