import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { documentRequirementRules } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';

export type DocumentRequirementContextKind =
  | 'vendor_category'
  | 'vendor_type'
  | 'subcontract'
  | 'employee'
  | 'project'
  | 'organization';

export interface DocumentRequirementRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly contextKind: DocumentRequirementContextKind;
  readonly catalogEntryId: string | null;
  readonly contextKey: string | null;
  readonly documentTypeKey: string;
  readonly required: boolean;
  readonly warnDaysBeforeExpiry: number | null;
  readonly label: string | null;
  readonly isActive: boolean;
  readonly sortOrder: number;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

function mapRow(row: typeof documentRequirementRules.$inferSelect): DocumentRequirementRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    contextKind: row.contextKind as DocumentRequirementContextKind,
    catalogEntryId: row.catalogEntryId ?? null,
    contextKey: row.contextKey ?? null,
    documentTypeKey: row.documentTypeKey,
    required: row.required,
    warnDaysBeforeExpiry: row.warnDaysBeforeExpiry ?? null,
    label: row.label ?? null,
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function listDocumentRequirementRules(
  db: DbExecutor,
  organizationId: string,
  options?: { readonly includeInactive?: boolean },
): Promise<DocumentRequirementRecord[]> {
  const conditions = [
    eq(documentRequirementRules.organizationId, organizationId),
    isNull(documentRequirementRules.archivedAt),
  ];
  if (!options?.includeInactive) {
    conditions.push(eq(documentRequirementRules.isActive, true));
  }
  const rows = await db
    .select()
    .from(documentRequirementRules)
    .where(and(...conditions))
    .orderBy(asc(documentRequirementRules.sortOrder), asc(documentRequirementRules.documentTypeKey));
  return rows.map(mapRow);
}

export async function findDocumentRequirementRuleByTarget(
  db: DbExecutor,
  organizationId: string,
  input: {
    readonly contextKind: DocumentRequirementContextKind;
    readonly contextKey?: string | null;
    readonly documentTypeKey: string;
  },
): Promise<DocumentRequirementRecord | null> {
  const conditions = [
    eq(documentRequirementRules.organizationId, organizationId),
    eq(documentRequirementRules.contextKind, input.contextKind),
    eq(documentRequirementRules.documentTypeKey, input.documentTypeKey),
    isNull(documentRequirementRules.archivedAt),
  ];
  if (input.contextKind === 'subcontract') {
    conditions.push(isNull(documentRequirementRules.contextKey));
  } else {
    conditions.push(eq(documentRequirementRules.contextKey, input.contextKey ?? ''));
  }

  const rows = await db
    .select()
    .from(documentRequirementRules)
    .where(and(...conditions))
    .limit(1);
  return rows[0] ? mapRow(rows[0]) : null;
}

export async function ensureDocumentRequirementRule(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly contextKind: DocumentRequirementContextKind;
    readonly catalogEntryId?: string | null;
    readonly contextKey?: string | null;
    readonly documentTypeKey: string;
    readonly required?: boolean;
    readonly warnDaysBeforeExpiry?: number | null;
    readonly label?: string | null;
    readonly sortOrder?: number;
  },
): Promise<DocumentRequirementRecord> {
  const existing = await findDocumentRequirementRuleByTarget(db, input.organizationId, {
    contextKind: input.contextKind,
    contextKey: input.contextKey ?? null,
    documentTypeKey: input.documentTypeKey,
  });
  if (existing) return existing;

  return insertDocumentRequirementRule(db, input);
}

export async function insertDocumentRequirementRule(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly contextKind: DocumentRequirementContextKind;
    readonly catalogEntryId?: string | null;
    readonly contextKey?: string | null;
    readonly documentTypeKey: string;
    readonly required?: boolean;
    readonly warnDaysBeforeExpiry?: number | null;
    readonly label?: string | null;
    readonly sortOrder?: number;
  },
): Promise<DocumentRequirementRecord> {
  const [row] = await db
    .insert(documentRequirementRules)
    .values({
      organizationId: input.organizationId,
      contextKind: input.contextKind,
      catalogEntryId: input.catalogEntryId ?? null,
      contextKey: input.contextKey ?? null,
      documentTypeKey: input.documentTypeKey,
      required: input.required ?? true,
      warnDaysBeforeExpiry: input.warnDaysBeforeExpiry ?? null,
      label: input.label ?? null,
      sortOrder: input.sortOrder ?? 0,
      isActive: true,
    })
    .returning();
  if (!row) throw new Error('document requirement insert returned no row');
  return mapRow(row);
}

export async function archiveDocumentRequirementRule(
  db: DbExecutor,
  organizationId: string,
  id: string,
): Promise<boolean> {
  const archived = await archiveDocumentRequirementRules(db, organizationId, [id]);
  return archived > 0;
}

export async function archiveDocumentRequirementRules(
  db: DbExecutor,
  organizationId: string,
  ids: readonly string[],
): Promise<number> {
  if (ids.length === 0) return 0;
  const result = await db
    .update(documentRequirementRules)
    .set({ archivedAt: new Date(), isActive: false, updatedAt: new Date() })
    .where(
      and(
        inArray(documentRequirementRules.id, [...ids]),
        eq(documentRequirementRules.organizationId, organizationId),
        isNull(documentRequirementRules.archivedAt),
      ),
    )
    .returning({ id: documentRequirementRules.id });
  return result.length;
}

export async function nextDocumentRequirementSortOrder(
  db: DbExecutor,
  organizationId: string,
): Promise<number> {
  const rows = await db
    .select({
      max: sql<number>`coalesce(max(${documentRequirementRules.sortOrder}), 0)`,
    })
    .from(documentRequirementRules)
    .where(eq(documentRequirementRules.organizationId, organizationId));
  return Number(rows[0]?.max ?? 0) + 10;
}
