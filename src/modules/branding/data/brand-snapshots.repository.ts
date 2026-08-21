import 'server-only';

import { and, eq, sql } from 'drizzle-orm';
import { documentBrandSnapshots } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type {
  BrandSnapshot,
  BrandSnapshotEntityType,
  DocumentBrandSnapshotRecord,
} from '../domain/types';

function mapRow(row: typeof documentBrandSnapshots.$inferSelect): DocumentBrandSnapshotRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    entityType: row.entityType as BrandSnapshotEntityType,
    entityId: row.entityId,
    brandProfileId: row.brandProfileId ?? null,
    snapshot: row.snapshot as unknown as BrandSnapshot,
    createdAt: row.createdAt,
  };
}

export async function findBrandSnapshot(
  db: DbExecutor,
  organizationId: string,
  entityType: BrandSnapshotEntityType,
  entityId: string,
): Promise<DocumentBrandSnapshotRecord | null> {
  return findBrandSnapshotForEntity(db, organizationId, entityType, entityId);
}

export async function findBrandSnapshotForEntity(
  db: DbExecutor,
  organizationId: string,
  entityType: BrandSnapshotEntityType,
  entityId: string,
): Promise<DocumentBrandSnapshotRecord | null> {
  const [row] = await db
    .select()
    .from(documentBrandSnapshots)
    .where(
      and(
        eq(documentBrandSnapshots.organizationId, organizationId),
        eq(documentBrandSnapshots.entityType, entityType),
        eq(documentBrandSnapshots.entityId, entityId),
      ),
    )
    .limit(1);
  return row ? mapRow(row) : null;
}

/**
 * First-write-wins freeze via SECURITY DEFINER RPC.
 * Snapshot JSON is built inside the RPC from canonical company/brand rows —
 * never from client-supplied payload.
 */
export async function upsertBrandSnapshot(
  db: DbExecutor,
  values: {
    organizationId: string;
    entityType: BrandSnapshotEntityType;
    entityId: string;
    brandProfileId?: string | null;
  },
): Promise<DocumentBrandSnapshotRecord> {
  const existing = await findBrandSnapshotForEntity(
    db,
    values.organizationId,
    values.entityType,
    values.entityId,
  );
  if (existing) return existing;

  await db.execute(sql`
    SELECT app.freeze_document_brand_snapshot(
      ${values.organizationId}::uuid,
      ${values.entityType},
      ${values.entityId}::uuid,
      ${values.brandProfileId ?? null}::uuid
    )
  `);

  const frozen = await findBrandSnapshotForEntity(
    db,
    values.organizationId,
    values.entityType,
    values.entityId,
  );
  if (!frozen) {
    throw new Error('Brand snapshot freeze did not persist');
  }
  return frozen;
}

/** @deprecated Use upsertBrandSnapshot — direct insert is RLS-blocked for members. */
export async function insertBrandSnapshot(
  db: DbExecutor,
  values: {
    organizationId: string;
    entityType: BrandSnapshotEntityType;
    entityId: string;
    brandProfileId?: string | null;
  },
): Promise<DocumentBrandSnapshotRecord> {
  return upsertBrandSnapshot(db, values);
}
