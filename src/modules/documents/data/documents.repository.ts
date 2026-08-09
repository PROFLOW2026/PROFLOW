import { and, eq, ilike, isNull, sql } from 'drizzle-orm';
import { documentLinks, documents } from '@drizzle/schema';
import {
  ORG_LIST_EXPORT_CAP,
  ORG_LIST_HARD_CAP,
  resolveListLimit,
  resolveListOffset,
} from '@/shared/db/list-limits';
import type { DbExecutor } from '@/shared/db/types';
import type {
  DocumentLinkRecord,
  DocumentListFilters,
  DocumentListItem,
  DocumentOwnerType,
  DocumentRecord,
  EntityDocumentFilters,
} from '../domain/types';

function mapDocument(row: typeof documents.$inferSelect): DocumentRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    storageBucket: row.storageBucket,
    storagePath: row.storagePath,
    originalFilename: row.originalFilename,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    checksum: row.checksum,
    status: row.status,
    uploadedByUserId: row.uploadedByUserId,
    deletedAt: row.deletedAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function mapLink(row: typeof documentLinks.$inferSelect): DocumentLinkRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentId: row.documentId,
    ownerType: row.ownerType,
    ownerId: row.ownerId,
    label: row.label,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function insertDocument(
  db: DbExecutor,
  input: {
    id: string;
    organizationId: string;
    storageBucket: string;
    storagePath: string;
    originalFilename: string;
    mimeType: string;
    sizeBytes?: number | null;
    uploadedByUserId?: string | null;
  },
): Promise<DocumentRecord> {
  const [row] = await db
    .insert(documents)
    .values({
      id: input.id,
      organizationId: input.organizationId,
      storageBucket: input.storageBucket,
      storagePath: input.storagePath,
      originalFilename: input.originalFilename,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes ?? null,
      status: 'pending',
      uploadedByUserId: input.uploadedByUserId ?? null,
    })
    .returning();

  return mapDocument(row!);
}

export async function updateDocumentById(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
  patch: Partial<{
    status: DocumentRecord['status'];
    sizeBytes: number | null;
    checksum: string | null;
    deletedAt: Date | null;
  }>,
): Promise<DocumentRecord | null> {
  const [row] = await db
    .update(documents)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)))
    .returning();

  return row ? mapDocument(row) : null;
}

export async function findDocumentById(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<DocumentRecord | null> {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), eq(documents.organizationId, organizationId)))
    .limit(1);

  return row ? mapDocument(row) : null;
}

export async function insertDocumentLink(
  db: DbExecutor,
  input: {
    organizationId: string;
    documentId: string;
    ownerType: DocumentOwnerType;
    ownerId: string;
    label?: string | null;
  },
): Promise<DocumentLinkRecord> {
  const [row] = await db
    .insert(documentLinks)
    .values({
      organizationId: input.organizationId,
      documentId: input.documentId,
      ownerType: input.ownerType,
      ownerId: input.ownerId,
      label: input.label ?? null,
    })
    .returning();

  return mapLink(row!);
}

export async function findDocumentLinkById(
  db: DbExecutor,
  organizationId: string,
  linkId: string,
): Promise<DocumentLinkRecord | null> {
  const [row] = await db
    .select()
    .from(documentLinks)
    .where(and(eq(documentLinks.id, linkId), eq(documentLinks.organizationId, organizationId)))
    .limit(1);

  return row ? mapLink(row) : null;
}

export async function deleteDocumentLink(
  db: DbExecutor,
  organizationId: string,
  linkId: string,
): Promise<boolean> {
  const deleted = await db
    .delete(documentLinks)
    .where(and(eq(documentLinks.id, linkId), eq(documentLinks.organizationId, organizationId)))
    .returning({ id: documentLinks.id });

  return deleted.length > 0;
}

export async function listDocumentsForEntity(
  db: DbExecutor,
  organizationId: string,
  filters: EntityDocumentFilters,
): Promise<DocumentListItem[]> {
  const rows = await db
    .select({ document: documents, link: documentLinks })
    .from(documentLinks)
    .innerJoin(documents, eq(documentLinks.documentId, documents.id))
    .where(
      and(
        eq(documentLinks.organizationId, organizationId),
        eq(documentLinks.ownerType, filters.ownerType),
        eq(documentLinks.ownerId, filters.ownerId),
        isNull(documents.deletedAt),
        sql`${documents.status} <> 'deleted'`,
      ),
    )
    .orderBy(documents.createdAt)
    .limit(resolveListLimit(filters.limit, { hardCap: ORG_LIST_HARD_CAP }))
    .offset(resolveListOffset(filters.offset));

  return rows.map((row) => ({
    ...mapDocument(row.document),
    label: row.link.label,
    linkId: row.link.id,
  }));
}

export async function listAllDocuments(
  db: DbExecutor,
  organizationId: string,
  filters: DocumentListFilters = {},
): Promise<DocumentListItem[]> {
  const conditions = [
    eq(documents.organizationId, organizationId),
    sql`${documents.status} <> 'deleted'`,
  ];

  if (!filters.includeDeleted) {
    conditions.push(isNull(documents.deletedAt));
  }

  if (filters.ownerType && filters.ownerType !== 'all') {
    conditions.push(
      sql`exists (
        select 1 from document_links dl
        where dl.document_id = ${documents.id}
          and dl.organization_id = ${organizationId}
          and dl.owner_type = ${filters.ownerType}
      )`,
    );
  }

  if (filters.search?.trim()) {
    const term = `%${filters.search.trim()}%`;
    conditions.push(ilike(documents.originalFilename, term));
  }

  const rows = await db
    .select({
      document: documents,
      label: sql<string | null>`(
        select dl.label from document_links dl
        where dl.document_id = ${documents.id}
          and dl.organization_id = ${organizationId}
        order by dl.created_at
        limit 1
      )`,
    })
    .from(documents)
    .where(and(...conditions))
    .orderBy(sql`${documents.createdAt} desc`)
    .limit(
      resolveListLimit(filters.limit, {
        hardCap:
          filters.limit != null && filters.limit > ORG_LIST_HARD_CAP
            ? ORG_LIST_EXPORT_CAP
            : ORG_LIST_HARD_CAP,
      }),
    )
    .offset(resolveListOffset(filters.offset));

  return rows.map((row) => ({
    ...mapDocument(row.document),
    label: row.label,
  }));
}

export async function countLinksForDocument(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documentLinks)
    .where(
      and(eq(documentLinks.organizationId, organizationId), eq(documentLinks.documentId, documentId)),
    );

  return row?.count ?? 0;
}
