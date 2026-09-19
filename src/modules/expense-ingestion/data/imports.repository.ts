import { and, desc, eq, inArray } from 'drizzle-orm';
import { externalExpenseImports } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  ExternalExpenseImport,
  ExternalExpenseImportStatus,
} from '../domain/types';
import { SUMIT_EXPENSE_IMPORT_PROVIDER } from '../domain/types';

function mapRow(row: typeof externalExpenseImports.$inferSelect): ExternalExpenseImport {
  return {
    id: row.id,
    organizationId: row.organizationId,
    provider: SUMIT_EXPENSE_IMPORT_PROVIDER,
    externalDocumentId: row.externalDocumentId,
    sourceDocumentType: row.sourceDocumentType ?? null,
    status: row.status as ExternalExpenseImportStatus,
    ocrJobId: row.ocrJobId ?? null,
    pdfChecksumSha256: row.pdfChecksumSha256 ?? null,
    detectedAt: row.detectedAt.toISOString(),
    lastCheckedAt: row.lastCheckedAt?.toISOString() ?? null,
    processedAt: row.processedAt?.toISOString() ?? null,
    errorCode: row.errorCode ?? null,
    errorMessage: row.errorMessage ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findImportByProviderDocument(
  db: DbExecutor,
  organizationId: string,
  externalDocumentId: string,
  provider: string = SUMIT_EXPENSE_IMPORT_PROVIDER,
): Promise<ExternalExpenseImport | null> {
  const [row] = await db
    .select()
    .from(externalExpenseImports)
    .where(
      and(
        eq(externalExpenseImports.organizationId, organizationId),
        eq(externalExpenseImports.provider, provider),
        eq(externalExpenseImports.externalDocumentId, externalDocumentId),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function upsertDetectedImport(
  db: DbExecutor,
  input: {
    organizationId: string;
    externalDocumentId: string;
    sourceDocumentType?: number | null;
  },
): Promise<ExternalExpenseImport> {
  const existing = await findImportByProviderDocument(
    db,
    input.organizationId,
    input.externalDocumentId,
  );
  const now = new Date();
  if (existing) {
    const [updated] = await db
      .update(externalExpenseImports)
      .set({
        lastCheckedAt: now,
        sourceDocumentType: input.sourceDocumentType ?? existing.sourceDocumentType,
        updatedAt: now,
      })
      .where(eq(externalExpenseImports.id, existing.id))
      .returning();
    return mapRow(updated!);
  }
  const [inserted] = await db
    .insert(externalExpenseImports)
    .values({
      organizationId: input.organizationId,
      provider: SUMIT_EXPENSE_IMPORT_PROVIDER,
      externalDocumentId: input.externalDocumentId,
      sourceDocumentType: input.sourceDocumentType ?? null,
      status: 'detected',
      detectedAt: now,
      lastCheckedAt: now,
    })
    .returning();
  return mapRow(inserted!);
}

export async function updateImport(
  db: DbExecutor,
  organizationId: string,
  importId: string,
  patch: Partial<{
    status: ExternalExpenseImportStatus;
    ocrJobId: string | null;
    pdfChecksumSha256: string | null;
    processedAt: Date | null;
    errorCode: string | null;
    errorMessage: string | null;
    lastCheckedAt: Date;
  }>,
): Promise<ExternalExpenseImport | null> {
  const [row] = await db
    .update(externalExpenseImports)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(externalExpenseImports.id, importId),
        eq(externalExpenseImports.organizationId, organizationId),
      ),
    )
    .returning();
  return row ? mapRow(row) : null;
}

export async function listImportsForOrg(
  db: DbExecutor,
  organizationId: string,
  options: { statuses?: readonly ExternalExpenseImportStatus[] } = {},
): Promise<ExternalExpenseImport[]> {
  const conditions = [eq(externalExpenseImports.organizationId, organizationId)];
  if (options.statuses?.length) {
    conditions.push(inArray(externalExpenseImports.status, [...options.statuses]));
  }
  const rows = await db
    .select()
    .from(externalExpenseImports)
    .where(and(...conditions))
    .orderBy(desc(externalExpenseImports.detectedAt));
  return rows.map(mapRow);
}

export async function findImportByOcrJobId(
  db: DbExecutor,
  organizationId: string,
  ocrJobId: string,
): Promise<ExternalExpenseImport | null> {
  const [row] = await db
    .select()
    .from(externalExpenseImports)
    .where(
      and(
        eq(externalExpenseImports.organizationId, organizationId),
        eq(externalExpenseImports.ocrJobId, ocrJobId),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}
