import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { quickCaptureItems } from '@drizzle/schema/quick-capture';
import type { DbExecutor } from '@/shared/db/types';
import type {
  CaptureItemRecord,
  CaptureSource,
  CaptureStatus,
  CaptureSuggestionMetadata,
  DetectedType,
  DetectionConfidence,
  SessionKind,
} from '../domain/types';

function toIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString() : value;
}

function mapRow(row: typeof quickCaptureItems.$inferSelect): CaptureItemRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    createdByUserId: row.createdByUserId,
    status: row.status as CaptureStatus,
    source: row.source as CaptureSource,
    sessionKind: row.sessionKind as SessionKind,
    documentCount: row.documentCount,
    ownerNote: row.ownerNote ?? null,
    explicitProjectId: row.explicitProjectId ?? null,
    detectedType: (row.detectedType as DetectedType | null) ?? null,
    detectionConfidence: (row.detectionConfidence as DetectionConfidence | null) ?? null,
    ownerSelectedType: (row.ownerSelectedType as DetectedType | null) ?? null,
    suggestedProjectId: row.suggestedProjectId ?? null,
    suggestedVendorId: row.suggestedVendorId ?? null,
    suggestionMetadata: (row.suggestionMetadata as CaptureSuggestionMetadata | null) ?? {},
    primaryOcrJobId: row.primaryOcrJobId ?? null,
    selectedFinancialDocumentId: row.selectedFinancialDocumentId ?? null,
    routedEntityType: row.routedEntityType ?? null,
    routedEntityId: row.routedEntityId ?? null,
    processingErrorCode: row.processingErrorCode ?? null,
    processingErrorMessage: row.processingErrorMessage ?? null,
    idempotencyKey: row.idempotencyKey ?? null,
    capturedAt: toIso(row.capturedAt) ?? row.createdAt.toISOString(),
    processedAt: toIso(row.processedAt),
    reviewedAt: toIso(row.reviewedAt),
    approvedAt: toIso(row.approvedAt),
    rejectedAt: toIso(row.rejectedAt),
    archivedAt: toIso(row.archivedAt),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function findCaptureById(
  db: DbExecutor,
  organizationId: string,
  captureId: string,
): Promise<CaptureItemRecord | null> {
  const [row] = await db
    .select()
    .from(quickCaptureItems)
    .where(and(eq(quickCaptureItems.id, captureId), eq(quickCaptureItems.organizationId, organizationId)))
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function findCaptureByIdempotencyKey(
  db: DbExecutor,
  organizationId: string,
  idempotencyKey: string,
): Promise<CaptureItemRecord | null> {
  const [row] = await db
    .select()
    .from(quickCaptureItems)
    .where(
      and(
        eq(quickCaptureItems.organizationId, organizationId),
        eq(quickCaptureItems.idempotencyKey, idempotencyKey),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

export async function insertCaptureItem(
  db: DbExecutor,
  input: {
    organizationId: string;
    createdByUserId: string;
    status?: CaptureStatus;
    source: CaptureSource;
    sessionKind: SessionKind;
    documentCount: number;
    ownerNote?: string | null;
    explicitProjectId?: string | null;
    idempotencyKey?: string | null;
    capturedAt?: Date;
  },
): Promise<CaptureItemRecord> {
  const [row] = await db
    .insert(quickCaptureItems)
    .values({
      organizationId: input.organizationId,
      createdByUserId: input.createdByUserId,
      status: input.status ?? 'captured',
      source: input.source,
      sessionKind: input.sessionKind,
      documentCount: input.documentCount,
      ownerNote: input.ownerNote ?? null,
      explicitProjectId: input.explicitProjectId ?? null,
      idempotencyKey: input.idempotencyKey ?? null,
      capturedAt: input.capturedAt ?? new Date(),
    })
    .returning();
  return mapRow(row!);
}

export async function updateCaptureItem(
  db: DbExecutor,
  organizationId: string,
  captureId: string,
  patch: Partial<{
    status: CaptureStatus;
    documentCount: number;
    detectedType: DetectedType | null;
    detectionConfidence: DetectionConfidence | null;
    ownerSelectedType: DetectedType | null;
    suggestedProjectId: string | null;
    suggestedVendorId: string | null;
    suggestionMetadata: CaptureSuggestionMetadata;
    primaryOcrJobId: string | null;
    selectedFinancialDocumentId: string | null;
    routedEntityType: string | null;
    routedEntityId: string | null;
    processingErrorCode: string | null;
    processingErrorMessage: string | null;
    processedAt: Date | null;
    reviewedAt: Date | null;
    approvedAt: Date | null;
    rejectedAt: Date | null;
    archivedAt: Date | null;
  }>,
): Promise<CaptureItemRecord | null> {
  const [row] = await db
    .update(quickCaptureItems)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(quickCaptureItems.id, captureId), eq(quickCaptureItems.organizationId, organizationId)))
    .returning();
  return row ? mapRow(row) : null;
}

export async function listCapturesForOrg(
  db: DbExecutor,
  organizationId: string,
  input: {
    statuses: readonly CaptureStatus[];
    limit?: number;
    offset?: number;
  },
): Promise<CaptureItemRecord[]> {
  const rows = await db
    .select()
    .from(quickCaptureItems)
    .where(
      and(
        eq(quickCaptureItems.organizationId, organizationId),
        inArray(quickCaptureItems.status, [...input.statuses]),
      ),
    )
    .orderBy(desc(quickCaptureItems.capturedAt))
    .limit(input.limit ?? 50)
    .offset(input.offset ?? 0);
  return rows.map(mapRow);
}

export async function countCapturesForOrg(
  db: DbExecutor,
  organizationId: string,
  statuses: readonly CaptureStatus[],
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(quickCaptureItems)
    .where(
      and(
        eq(quickCaptureItems.organizationId, organizationId),
        inArray(quickCaptureItems.status, [...statuses]),
      ),
    );
  return row?.count ?? 0;
}
