import { and, asc, eq } from 'drizzle-orm';
import { quickCaptureItemDocuments } from '@drizzle/schema/quick-capture';
import type { DbExecutor } from '@/shared/db/types';
import type { CaptureDocumentRecord } from '../domain/types';

function mapRow(row: typeof quickCaptureItemDocuments.$inferSelect): CaptureDocumentRecord {
  return {
    id: row.id,
    quickCaptureItemId: row.quickCaptureItemId,
    documentId: row.documentId,
    organizationId: row.organizationId,
    position: row.position,
    ocrJobId: row.ocrJobId ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function insertCaptureDocument(
  db: DbExecutor,
  input: {
    quickCaptureItemId: string;
    documentId: string;
    organizationId: string;
    position: number;
    ocrJobId?: string | null;
  },
): Promise<CaptureDocumentRecord> {
  const [row] = await db
    .insert(quickCaptureItemDocuments)
    .values({
      quickCaptureItemId: input.quickCaptureItemId,
      documentId: input.documentId,
      organizationId: input.organizationId,
      position: input.position,
      ocrJobId: input.ocrJobId ?? null,
    })
    .returning();
  return mapRow(row!);
}

export async function listCaptureDocumentsByCaptureId(
  db: DbExecutor,
  organizationId: string,
  captureId: string,
): Promise<CaptureDocumentRecord[]> {
  const rows = await db
    .select()
    .from(quickCaptureItemDocuments)
    .where(
      and(
        eq(quickCaptureItemDocuments.organizationId, organizationId),
        eq(quickCaptureItemDocuments.quickCaptureItemId, captureId),
      ),
    )
    .orderBy(asc(quickCaptureItemDocuments.position));
  return rows.map(mapRow);
}

export async function findCaptureDocumentMembership(
  db: DbExecutor,
  organizationId: string,
  captureId: string,
  documentId: string,
): Promise<CaptureDocumentRecord | null> {
  const [row] = await db
    .select()
    .from(quickCaptureItemDocuments)
    .where(
      and(
        eq(quickCaptureItemDocuments.organizationId, organizationId),
        eq(quickCaptureItemDocuments.quickCaptureItemId, captureId),
        eq(quickCaptureItemDocuments.documentId, documentId),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function updateCaptureDocument(
  db: DbExecutor,
  organizationId: string,
  junctionId: string,
  patch: Partial<{ ocrJobId: string | null }>,
): Promise<CaptureDocumentRecord | null> {
  const [row] = await db
    .update(quickCaptureItemDocuments)
    .set(patch)
    .where(
      and(
        eq(quickCaptureItemDocuments.id, junctionId),
        eq(quickCaptureItemDocuments.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapRow(row) : null;
}

export async function deleteCaptureDocumentsForCapture(
  db: DbExecutor,
  organizationId: string,
  captureId: string,
): Promise<number> {
  const deleted = await db
    .delete(quickCaptureItemDocuments)
    .where(
      and(
        eq(quickCaptureItemDocuments.organizationId, organizationId),
        eq(quickCaptureItemDocuments.quickCaptureItemId, captureId),
      ),
    )
    .returning({ id: quickCaptureItemDocuments.id });
  return deleted.length;
}
