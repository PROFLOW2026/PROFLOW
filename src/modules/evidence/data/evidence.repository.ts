import { and, count, desc, eq } from 'drizzle-orm';
import { evidenceItems, externalPrincipals, profiles } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { EvidenceItem, EvidenceKind, EvidenceVisibility } from '../domain/types';

/** All reads run on the caller's RLS-bound executor; RLS adds vendor / capability filtering. */

export type EvidenceRow = typeof evidenceItems.$inferSelect;

export interface InsertEvidenceInput {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly entityType: string;
  readonly entityId: string;
  readonly vendorId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly locationId: string | null;
  readonly kind: EvidenceKind;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly caption: string | null;
  readonly visibility: EvidenceVisibility;
  readonly uploadedByActorType: 'internal' | 'external';
  readonly uploadedByUserId: string | null;
  readonly uploadedByPrincipalId: string | null;
}

/** No RETURNING: an external uploader may insert before any SELECT policy would match. */
export async function insertEvidence(db: DbExecutor, input: InsertEvidenceInput): Promise<void> {
  await db.insert(evidenceItems).values({ ...input, status: 'pending' });
}

export async function findEvidenceById(
  db: DbExecutor,
  organizationId: string,
  evidenceId: string,
): Promise<EvidenceRow | null> {
  const [row] = await db
    .select()
    .from(evidenceItems)
    .where(and(eq(evidenceItems.organizationId, organizationId), eq(evidenceItems.id, evidenceId)))
    .limit(1);
  return row ?? null;
}

/** Looks an evidence id up without knowing the org (file routes); RLS still decides visibility. */
export async function findVisibleEvidence(db: DbExecutor, evidenceId: string): Promise<EvidenceRow | null> {
  const [row] = await db.select().from(evidenceItems).where(eq(evidenceItems.id, evidenceId)).limit(1);
  return row ?? null;
}

export async function markEvidenceAvailable(
  db: DbExecutor,
  organizationId: string,
  evidenceId: string,
  sizeBytes: number,
): Promise<boolean> {
  const rows = await db
    .update(evidenceItems)
    .set({ status: 'available', availableAt: new Date(), sizeBytes })
    .where(
      and(
        eq(evidenceItems.organizationId, organizationId),
        eq(evidenceItems.id, evidenceId),
        eq(evidenceItems.status, 'pending'),
      ),
    )
    .returning({ id: evidenceItems.id });
  return rows.length === 1;
}

export async function markEvidenceRemoved(
  db: DbExecutor,
  organizationId: string,
  evidenceId: string,
  by: { readonly userId: string | null; readonly principalId: string | null },
): Promise<boolean> {
  const rows = await db
    .update(evidenceItems)
    .set({ status: 'removed', removedAt: new Date(), removedByUserId: by.userId, removedByPrincipalId: by.principalId })
    .where(and(eq(evidenceItems.organizationId, organizationId), eq(evidenceItems.id, evidenceId)))
    .returning({ id: evidenceItems.id });
  return rows.length === 1;
}

export async function updateEvidenceMetadata(
  db: DbExecutor,
  organizationId: string,
  evidenceId: string,
  patch: { readonly caption?: string | null; readonly visibility?: EvidenceVisibility },
): Promise<boolean> {
  const rows = await db
    .update(evidenceItems)
    .set(patch)
    .where(and(eq(evidenceItems.organizationId, organizationId), eq(evidenceItems.id, evidenceId)))
    .returning({ id: evidenceItems.id });
  return rows.length === 1;
}

const MAX_LIST = 500;

export async function listEntityEvidence(
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly entityType: string;
    readonly entityId: string;
    readonly contractorOnly: boolean;
    readonly limit?: number;
  },
): Promise<EvidenceItem[]> {
  const conditions = [
    eq(evidenceItems.organizationId, input.organizationId),
    eq(evidenceItems.entityType, input.entityType),
    eq(evidenceItems.entityId, input.entityId),
    eq(evidenceItems.status, 'available'),
  ];
  if (input.contractorOnly) conditions.push(eq(evidenceItems.visibility, 'contractor'));
  const limit = Math.min(Math.max(input.limit ?? 200, 1), MAX_LIST);

  const rows = await db
    .select({
      id: evidenceItems.id,
      documentId: evidenceItems.documentId,
      kind: evidenceItems.kind,
      fileName: evidenceItems.fileName,
      mimeType: evidenceItems.mimeType,
      sizeBytes: evidenceItems.sizeBytes,
      caption: evidenceItems.caption,
      visibility: evidenceItems.visibility,
      locationId: evidenceItems.locationId,
      vendorId: evidenceItems.vendorId,
      uploadedAt: evidenceItems.uploadedAt,
      actorType: evidenceItems.uploadedByActorType,
      userName: profiles.displayName,
      principalName: externalPrincipals.displayName,
    })
    .from(evidenceItems)
    .leftJoin(profiles, eq(profiles.id, evidenceItems.uploadedByUserId))
    .leftJoin(externalPrincipals, eq(externalPrincipals.id, evidenceItems.uploadedByPrincipalId))
    .where(and(...conditions))
    .orderBy(desc(evidenceItems.uploadedAt))
    .limit(limit);

  return rows.map((row) => ({
    evidenceId: row.id,
    documentId: row.documentId,
    kind: row.kind,
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    caption: row.caption,
    visibility: row.visibility,
    locationId: row.locationId,
    vendorId: row.vendorId,
    uploadedAt: row.uploadedAt.toISOString(),
    uploader: {
      type: row.actorType,
      displayName: row.actorType === 'external' ? (row.principalName ?? null) : (row.userName ?? null),
    },
  }));
}

export async function countEntityEvidence(
  db: DbExecutor,
  input: { readonly organizationId: string; readonly entityType: string; readonly entityId: string },
): Promise<number> {
  const [row] = await db
    .select({ value: count() })
    .from(evidenceItems)
    .where(
      and(
        eq(evidenceItems.organizationId, input.organizationId),
        eq(evidenceItems.entityType, input.entityType),
        eq(evidenceItems.entityId, input.entityId),
        eq(evidenceItems.status, 'available'),
      ),
    );
  return Number(row?.value ?? 0);
}
