import { and, eq } from 'drizzle-orm';
import { documentNumberSequences } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import {
  DOCUMENT_NUMBER_KINDS,
  defaultDocumentNumberSequence,
  isDocumentNumberKind,
  type DocumentNumberKind,
  type DocumentNumberSequenceRecord,
} from '../domain/document-numbers';

function mapSequence(row: typeof documentNumberSequences.$inferSelect): DocumentNumberSequenceRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    documentKind: isDocumentNumberKind(row.documentKind) ? row.documentKind : 'estimate',
    prefix: row.prefix,
    padding: row.padding,
    nextNumber: row.nextNumber,
  };
}

export async function listDocumentNumberSequences(
  db: DbExecutor,
  organizationId: string,
): Promise<DocumentNumberSequenceRecord[]> {
  const rows = await db
    .select()
    .from(documentNumberSequences)
    .where(eq(documentNumberSequences.organizationId, organizationId));

  const byKind = new Map(rows.map((row) => [row.documentKind, mapSequence(row)]));
  return DOCUMENT_NUMBER_KINDS.map(
    (kind) => byKind.get(kind) ?? defaultDocumentNumberSequence(organizationId, kind),
  );
}

export async function upsertDocumentNumberSequence(
  db: DbExecutor,
  input: {
    organizationId: string;
    documentKind: DocumentNumberKind;
    prefix: string;
    padding: number;
    nextNumber: number;
  },
): Promise<DocumentNumberSequenceRecord> {
  const [row] = await db
    .insert(documentNumberSequences)
    .values({
      organizationId: input.organizationId,
      documentKind: input.documentKind,
      prefix: input.prefix,
      padding: input.padding,
      nextNumber: input.nextNumber,
    })
    .onConflictDoUpdate({
      target: [documentNumberSequences.organizationId, documentNumberSequences.documentKind],
      set: {
        prefix: input.prefix,
        padding: input.padding,
        nextNumber: input.nextNumber,
        updatedAt: new Date(),
      },
    })
    .returning();

  return mapSequence(row!);
}

export async function findDocumentNumberSequence(
  db: DbExecutor,
  organizationId: string,
  documentKind: DocumentNumberKind,
): Promise<DocumentNumberSequenceRecord | null> {
  const [row] = await db
    .select()
    .from(documentNumberSequences)
    .where(
      and(
        eq(documentNumberSequences.organizationId, organizationId),
        eq(documentNumberSequences.documentKind, documentKind),
      ),
    )
    .limit(1);

  return row ? mapSequence(row) : null;
}
