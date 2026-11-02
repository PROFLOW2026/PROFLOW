import { and, asc, desc, eq, gte, ilike, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import {
  evidenceItems,
  externalPrincipals,
  infraCaptureVersions,
  infraCaptures,
  infraComparisons,
  infraFolderMappings,
  infraMarkings,
  profiles,
  projectLocations,
  tasks,
} from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { readLocationMeta } from '@/modules/project-profile/domain/unit-levels';
import { escapeLikePattern } from '../domain/filters';
import { readMarkingGeometry } from '../domain/markings';
import type {
  InfraActorDto,
  InfraCaptureDto,
  InfraCaptureRole,
  InfraCaptureSource,
  InfraComparisonDto,
  InfraComparisonMode,
  InfraFolderStatusDto,
  InfraMarkingDto,
  InfraType,
  InfraVersionDto,
} from '../domain/types';

/**
 * Persistence for infrastructure mapping (migration 0195 tables). Reads and ordinary writes run on
 * the caller's RLS-bound executor (internal user or contractor principal); folder mappings are
 * written through the trusted service-role runner by the folder service.
 */

export type CaptureInsert = typeof infraCaptures.$inferInsert;
export type CaptureRow = typeof infraCaptures.$inferSelect;

/** No RETURNING: an external uploader may insert before its SELECT policy would match. */
export async function insertCapture(db: DbExecutor, row: CaptureInsert): Promise<void> {
  await db.insert(infraCaptures).values(row);
}

export async function findCaptureRow(db: DbExecutor, organizationId: string, captureId: string): Promise<CaptureRow | null> {
  const [row] = await db
    .select()
    .from(infraCaptures)
    .where(and(eq(infraCaptures.organizationId, organizationId), eq(infraCaptures.id, captureId)))
    .limit(1);
  return row ?? null;
}

/** Capture by id without knowing the organization (RLS still decides visibility). */
export async function findVisibleCaptureRow(db: DbExecutor, captureId: string): Promise<CaptureRow | null> {
  const [row] = await db.select().from(infraCaptures).where(eq(infraCaptures.id, captureId)).limit(1);
  return row ?? null;
}

export async function findCaptureByClientId(
  db: DbExecutor,
  organizationId: string,
  clientCaptureId: string,
): Promise<CaptureRow | null> {
  const [row] = await db
    .select()
    .from(infraCaptures)
    .where(and(eq(infraCaptures.organizationId, organizationId), eq(infraCaptures.clientCaptureId, clientCaptureId)))
    .limit(1);
  return row ?? null;
}

export async function findCaptureByEvidenceId(
  db: DbExecutor,
  organizationId: string,
  evidenceId: string,
): Promise<CaptureRow | null> {
  const [row] = await db
    .select()
    .from(infraCaptures)
    .where(and(eq(infraCaptures.organizationId, organizationId), eq(infraCaptures.evidenceId, evidenceId)))
    .limit(1);
  return row ?? null;
}

export interface CapturePatch {
  readonly locationId?: string;
  readonly levelId?: string | null;
  readonly taskId?: string | null;
  readonly role?: InfraCaptureRole;
  readonly description?: string | null;
  readonly room?: string | null;
  readonly wall?: string | null;
  readonly infraType?: InfraType | null;
  readonly dimensions?: string | null;
  readonly note?: string | null;
  readonly markingVersion?: number;
  readonly removedAt?: Date | null;
}

export async function updateCaptureRow(
  db: DbExecutor,
  organizationId: string,
  captureId: string,
  patch: CapturePatch,
): Promise<boolean> {
  const rows = await db
    .update(infraCaptures)
    .set(patch)
    .where(and(eq(infraCaptures.organizationId, organizationId), eq(infraCaptures.id, captureId)))
    .returning({ id: infraCaptures.id });
  return rows.length === 1;
}

/** Keeps the evidence index row in step with a moved capture (entity_id is immutable by design). */
export async function syncEvidenceLocation(
  db: DbExecutor,
  organizationId: string,
  evidenceIds: readonly string[],
  locationId: string,
): Promise<void> {
  if (evidenceIds.length === 0) return;
  await db
    .update(evidenceItems)
    .set({ locationId })
    .where(and(eq(evidenceItems.organizationId, organizationId), inArray(evidenceItems.id, [...evidenceIds])));
}

const CAPTURE_SELECT = {
  id: infraCaptures.id,
  organizationId: infraCaptures.organizationId,
  evidenceId: infraCaptures.evidenceId,
  projectId: infraCaptures.projectId,
  locationId: infraCaptures.locationId,
  levelId: infraCaptures.levelId,
  taskId: infraCaptures.taskId,
  role: infraCaptures.role,
  source: infraCaptures.source,
  description: infraCaptures.description,
  room: infraCaptures.room,
  wall: infraCaptures.wall,
  infraType: infraCaptures.infraType,
  dimensions: infraCaptures.dimensions,
  note: infraCaptures.note,
  markingVersion: infraCaptures.markingVersion,
  capturedAt: infraCaptures.capturedAt,
  actorType: infraCaptures.createdByActorType,
  createdByUserId: infraCaptures.createdByUserId,
  createdByPrincipalId: infraCaptures.createdByPrincipalId,
  userName: profiles.displayName,
  principalName: externalPrincipals.displayName,
  fileName: evidenceItems.fileName,
  mimeType: evidenceItems.mimeType,
  sizeBytes: evidenceItems.sizeBytes,
  evidenceStatus: evidenceItems.status,
};

export type CaptureJoinRow = {
  id: string;
  organizationId: string;
  evidenceId: string;
  projectId: string;
  locationId: string;
  levelId: string | null;
  taskId: string | null;
  role: InfraCaptureRole;
  source: InfraCaptureSource;
  description: string | null;
  room: string | null;
  wall: string | null;
  infraType: InfraType | null;
  dimensions: string | null;
  note: string | null;
  markingVersion: number;
  capturedAt: Date;
  actorType: 'internal' | 'external';
  createdByUserId: string | null;
  createdByPrincipalId: string | null;
  userName: string | null;
  principalName: string | null;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  evidenceStatus: 'pending' | 'available' | 'removed';
};

export function actorOf(row: { actorType: 'internal' | 'external'; userName: string | null; principalName: string | null }): InfraActorDto {
  return {
    type: row.actorType,
    displayName: row.actorType === 'external' ? row.principalName : row.userName,
  };
}

export function toCaptureDto(row: CaptureJoinRow, latestAnnotatedEvidenceId: string | null, canEdit: boolean): InfraCaptureDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    evidenceId: row.evidenceId,
    projectId: row.projectId,
    locationId: row.locationId,
    levelId: row.levelId,
    taskId: row.taskId,
    role: row.role,
    source: row.source,
    description: row.description,
    room: row.room,
    wall: row.wall,
    infraType: row.infraType,
    dimensions: row.dimensions,
    note: row.note,
    markingVersion: row.markingVersion,
    latestAnnotatedEvidenceId,
    capturedAt: row.capturedAt.toISOString(),
    createdBy: actorOf(row),
    fileName: row.fileName,
    mimeType: row.mimeType,
    sizeBytes: row.sizeBytes,
    status: row.evidenceStatus === 'available' ? 'available' : 'pending',
    canEdit,
  };
}

function captureJoin(db: DbExecutor) {
  return db
    .select(CAPTURE_SELECT)
    .from(infraCaptures)
    .innerJoin(
      evidenceItems,
      and(eq(evidenceItems.id, infraCaptures.evidenceId), eq(evidenceItems.organizationId, infraCaptures.organizationId)),
    )
    .leftJoin(profiles, eq(profiles.id, infraCaptures.createdByUserId))
    .leftJoin(externalPrincipals, eq(externalPrincipals.id, infraCaptures.createdByPrincipalId));
}

export async function findCaptureJoin(db: DbExecutor, organizationId: string, captureId: string): Promise<CaptureJoinRow | null> {
  const [row] = await captureJoin(db)
    .where(and(eq(infraCaptures.organizationId, organizationId), eq(infraCaptures.id, captureId), isNull(infraCaptures.removedAt)))
    .limit(1);
  return (row as CaptureJoinRow | undefined) ?? null;
}

export interface ListCapturesQuery {
  readonly organizationId: string;
  readonly projectId: string;
  readonly locationIds?: readonly string[];
  /** Level filter: captures saved with this level, plus older captures (no level) of the fallback locations. */
  readonly level?: { readonly id: string; readonly fallbackLocationIds: readonly string[] };
  readonly text?: string;
  /** Locations whose name matched the free text. */
  readonly textLocationIds?: readonly string[];
  readonly textInfraTypes?: readonly InfraType[];
  readonly room?: string;
  readonly wall?: string;
  readonly infraType?: InfraType;
  readonly role?: InfraCaptureRole;
  readonly taskId?: string;
  readonly from?: Date | null;
  readonly toExclusive?: Date | null;
  readonly createdByUserId?: string;
  readonly createdByPrincipalId?: string;
  /** Restrict to photos or to videos (the evidence kind); omitted = both. */
  readonly media?: 'photo' | 'video';
  readonly cursor?: { readonly capturedAt: Date; readonly id: string } | null;
  readonly limit: number;
}

/** Keyset-paginated listing, newest first. Only captures whose original reached the cloud are listed. */
export async function listCaptureRows(db: DbExecutor, query: ListCapturesQuery): Promise<CaptureJoinRow[]> {
  const conditions: (SQL | undefined)[] = [
    eq(infraCaptures.organizationId, query.organizationId),
    eq(infraCaptures.projectId, query.projectId),
    isNull(infraCaptures.removedAt),
    eq(evidenceItems.status, 'available'),
  ];
  if (query.locationIds) {
    if (query.locationIds.length === 0) return [];
    conditions.push(inArray(infraCaptures.locationId, [...query.locationIds]));
  }
  if (query.level) {
    const { id, fallbackLocationIds } = query.level;
    conditions.push(
      fallbackLocationIds.length > 0
        ? or(eq(infraCaptures.levelId, id), and(isNull(infraCaptures.levelId), inArray(infraCaptures.locationId, [...fallbackLocationIds])))
        : eq(infraCaptures.levelId, id),
    );
  }
  if (query.text) {
    const pattern = `%${escapeLikePattern(query.text)}%`;
    const options: (SQL | undefined)[] = [
      ilike(infraCaptures.description, pattern),
      ilike(infraCaptures.room, pattern),
      ilike(infraCaptures.wall, pattern),
      ilike(infraCaptures.note, pattern),
      ilike(infraCaptures.dimensions, pattern),
    ];
    if (query.textInfraTypes && query.textInfraTypes.length > 0) {
      options.push(inArray(infraCaptures.infraType, [...query.textInfraTypes]));
    }
    if (query.textLocationIds && query.textLocationIds.length > 0) {
      options.push(inArray(infraCaptures.locationId, [...query.textLocationIds]));
    }
    conditions.push(or(...options));
  }
  if (query.room) conditions.push(ilike(infraCaptures.room, `%${escapeLikePattern(query.room)}%`));
  if (query.wall) conditions.push(ilike(infraCaptures.wall, `%${escapeLikePattern(query.wall)}%`));
  if (query.infraType) conditions.push(eq(infraCaptures.infraType, query.infraType));
  if (query.role) conditions.push(eq(infraCaptures.role, query.role));
  if (query.taskId) conditions.push(eq(infraCaptures.taskId, query.taskId));
  if (query.from) conditions.push(gte(infraCaptures.capturedAt, query.from));
  if (query.toExclusive) conditions.push(lt(infraCaptures.capturedAt, query.toExclusive));
  if (query.createdByUserId) conditions.push(eq(infraCaptures.createdByUserId, query.createdByUserId));
  if (query.createdByPrincipalId) conditions.push(eq(infraCaptures.createdByPrincipalId, query.createdByPrincipalId));
  if (query.media) conditions.push(eq(evidenceItems.kind, query.media));
  if (query.cursor) {
    conditions.push(
      or(
        lt(infraCaptures.capturedAt, query.cursor.capturedAt),
        and(eq(infraCaptures.capturedAt, query.cursor.capturedAt), lt(infraCaptures.id, query.cursor.id)),
      ),
    );
  }
  const rows = await captureJoin(db)
    .where(and(...conditions))
    .orderBy(desc(infraCaptures.capturedAt), desc(infraCaptures.id))
    .limit(query.limit);
  return rows as CaptureJoinRow[];
}

/** Distinct room / wall values already used in the project (typeahead for the details form). */
export async function listDistinctDescriptors(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<{ rooms: string[]; walls: string[] }> {
  const base = and(
    eq(infraCaptures.organizationId, organizationId),
    eq(infraCaptures.projectId, projectId),
    isNull(infraCaptures.removedAt),
  );
  const [rooms, walls] = await Promise.all([
    db
      .selectDistinct({ value: infraCaptures.room })
      .from(infraCaptures)
      .where(and(base, sql`${infraCaptures.room} IS NOT NULL`))
      .orderBy(asc(infraCaptures.room))
      .limit(200),
    db
      .selectDistinct({ value: infraCaptures.wall })
      .from(infraCaptures)
      .where(and(base, sql`${infraCaptures.wall} IS NOT NULL`))
      .orderBy(asc(infraCaptures.wall))
      .limit(200),
  ]);
  return {
    rooms: rooms.map((row) => row.value).filter((value): value is string => Boolean(value)),
    walls: walls.map((row) => row.value).filter((value): value is string => Boolean(value)),
  };
}

// ── evidence index rows (read-only; the evidence module owns writes) ───────────────────────────

export interface EvidenceBrief {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly documentId: string;
  readonly locationId: string | null;
  readonly status: 'pending' | 'available' | 'removed';
  readonly fileName: string;
  readonly mimeType: string;
  readonly uploadedByActorType: 'internal' | 'external';
  readonly uploadedByUserId?: string | null;
  /** Declared size (bytes) registered when the upload began. */
  readonly sizeBytes?: number;
  readonly kind?: 'photo' | 'video' | 'document';
}

export async function listEvidenceBriefs(
  db: DbExecutor,
  organizationId: string,
  evidenceIds: readonly string[],
): Promise<EvidenceBrief[]> {
  if (evidenceIds.length === 0) return [];
  const rows = await db
    .select({
      id: evidenceItems.id,
      organizationId: evidenceItems.organizationId,
      projectId: evidenceItems.projectId,
      documentId: evidenceItems.documentId,
      locationId: evidenceItems.locationId,
      status: evidenceItems.status,
      fileName: evidenceItems.fileName,
      mimeType: evidenceItems.mimeType,
      uploadedByActorType: evidenceItems.uploadedByActorType,
      uploadedByUserId: evidenceItems.uploadedByUserId,
      sizeBytes: evidenceItems.sizeBytes,
      kind: evidenceItems.kind,
    })
    .from(evidenceItems)
    .where(and(eq(evidenceItems.organizationId, organizationId), inArray(evidenceItems.id, [...evidenceIds])));
  return rows as EvidenceBrief[];
}

/** The location an infrastructure evidence file belongs to (used to pick the cloud folder on upload). */
export async function findEvidenceLocationByDocument(
  db: DbExecutor,
  organizationId: string,
  documentId: string,
): Promise<string | null> {
  const [row] = await db
    .select({ locationId: evidenceItems.locationId, entityType: evidenceItems.entityType })
    .from(evidenceItems)
    .where(and(eq(evidenceItems.organizationId, organizationId), eq(evidenceItems.documentId, documentId)))
    .limit(1);
  return row && row.entityType === 'project_location' ? row.locationId : null;
}

/** Evidence ids of every file that belongs to a capture: the original and each marked version. */
export async function captureEvidenceIds(db: DbExecutor, organizationId: string, captureId: string): Promise<string[]> {
  const [capture] = await db
    .select({ evidenceId: infraCaptures.evidenceId })
    .from(infraCaptures)
    .where(and(eq(infraCaptures.organizationId, organizationId), eq(infraCaptures.id, captureId)))
    .limit(1);
  if (!capture) return [];
  const versions = await db
    .select({ evidenceId: infraCaptureVersions.annotatedEvidenceId })
    .from(infraCaptureVersions)
    .where(and(eq(infraCaptureVersions.organizationId, organizationId), eq(infraCaptureVersions.captureId, captureId)));
  return [capture.evidenceId, ...versions.map((row) => row.evidenceId)];
}

/** Highest version number ever created for a capture (available or not). */
export async function maxVersionNumber(db: DbExecutor, organizationId: string, captureId: string): Promise<number> {
  const [row] = await db
    .select({ max: sql<number>`COALESCE(MAX(${infraCaptureVersions.version}), 0)::int` })
    .from(infraCaptureVersions)
    .where(and(eq(infraCaptureVersions.organizationId, organizationId), eq(infraCaptureVersions.captureId, captureId)));
  return row?.max ?? 0;
}

/** The task exists, is visible to the caller and is attributed to this project. */
export async function taskBelongsToProject(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  taskId: string,
): Promise<boolean> {
  const [row] = await db
    .select({ id: tasks.id })
    .from(tasks)
    .where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
    .limit(1);
  return Boolean(row);
}

export async function findTaskBrief(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  taskId: string,
): Promise<{ id: string; title: string } | null> {
  const [row] = await db
    .select({ id: tasks.id, title: tasks.title })
    .from(tasks)
    .where(and(eq(tasks.organizationId, organizationId), eq(tasks.id, taskId), eq(tasks.projectId, projectId)))
    .limit(1);
  return row ?? null;
}

// ── locations (read-only view of the reused project_locations table) ───────────────────────────

export interface LocationNodeRow {
  readonly id: string;
  readonly parentId: string | null;
  readonly name: string;
  readonly code: string | null;
  readonly type: string;
  readonly sortOrder: number;
  readonly isActive: boolean;
  readonly archived: boolean;
  readonly extraLevelIds?: readonly string[];
  readonly levelId?: string | null;
  readonly structure?: 'house' | 'building' | null;
  readonly unitKind?: string | null;
}

export async function listLocationNodes(db: DbExecutor, organizationId: string, projectId: string): Promise<LocationNodeRow[]> {
  const rows = await db
    .select({
      id: projectLocations.id,
      parentId: projectLocations.parentId,
      name: projectLocations.name,
      code: projectLocations.code,
      type: projectLocations.type,
      sortOrder: projectLocations.sortOrder,
      isActive: projectLocations.isActive,
      archivedAt: projectLocations.archivedAt,
      metadata: projectLocations.metadata,
    })
    .from(projectLocations)
    .where(and(eq(projectLocations.organizationId, organizationId), eq(projectLocations.projectId, projectId)))
    .orderBy(asc(projectLocations.parentId), asc(projectLocations.sortOrder), asc(projectLocations.name));
  return rows.map((row) => {
    const meta = readLocationMeta(row.metadata);
    return {
      id: row.id,
      parentId: row.parentId,
      name: row.name,
      code: row.code,
      type: row.type,
      sortOrder: row.sortOrder,
      isActive: row.isActive,
      archived: row.archivedAt !== null,
      ...(meta.extraLevelIds.length > 0 ? { extraLevelIds: meta.extraLevelIds } : {}),
      ...(meta.levelId ? { levelId: meta.levelId } : {}),
      ...(meta.structure ? { structure: meta.structure } : {}),
      ...(meta.unitKind ? { unitKind: meta.unitKind } : {}),
    };
  });
}

// ── versions + markings ────────────────────────────────────────────────────────────────────────

export async function insertVersion(
  db: DbExecutor,
  row: typeof infraCaptureVersions.$inferInsert,
): Promise<void> {
  await db.insert(infraCaptureVersions).values(row);
}

export async function insertMarkings(db: DbExecutor, rows: (typeof infraMarkings.$inferInsert)[]): Promise<void> {
  const CHUNK = 100;
  for (let offset = 0; offset < rows.length; offset += CHUNK) {
    await db.insert(infraMarkings).values(rows.slice(offset, offset + CHUNK));
  }
}

export async function listVersionRows(db: DbExecutor, organizationId: string, captureId: string): Promise<InfraVersionDto[]> {
  const rows = await db
    .select({
      id: infraCaptureVersions.id,
      version: infraCaptureVersions.version,
      annotatedEvidenceId: infraCaptureVersions.annotatedEvidenceId,
      markingCount: infraCaptureVersions.markingCount,
      createdAt: infraCaptureVersions.createdAt,
      actorType: infraCaptureVersions.createdByActorType,
      userName: profiles.displayName,
      principalName: externalPrincipals.displayName,
    })
    .from(infraCaptureVersions)
    .innerJoin(
      evidenceItems,
      and(
        eq(evidenceItems.id, infraCaptureVersions.annotatedEvidenceId),
        eq(evidenceItems.organizationId, infraCaptureVersions.organizationId),
      ),
    )
    .leftJoin(profiles, eq(profiles.id, infraCaptureVersions.createdByUserId))
    .leftJoin(externalPrincipals, eq(externalPrincipals.id, infraCaptureVersions.createdByPrincipalId))
    .where(
      and(
        eq(infraCaptureVersions.organizationId, organizationId),
        eq(infraCaptureVersions.captureId, captureId),
        eq(evidenceItems.status, 'available'),
      ),
    )
    .orderBy(desc(infraCaptureVersions.version));
  return rows.map((row) => ({
    id: row.id,
    version: row.version,
    annotatedEvidenceId: row.annotatedEvidenceId,
    markingCount: row.markingCount,
    createdAt: row.createdAt.toISOString(),
    createdBy: actorOf(row),
  }));
}

/** Newest AVAILABLE annotated image per capture (the gallery shows the marked version when present). */
export async function latestAnnotatedByCapture(
  db: DbExecutor,
  organizationId: string,
  captureIds: readonly string[],
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (captureIds.length === 0) return result;
  const rows = await db
    .select({
      captureId: infraCaptureVersions.captureId,
      annotatedEvidenceId: infraCaptureVersions.annotatedEvidenceId,
      version: infraCaptureVersions.version,
    })
    .from(infraCaptureVersions)
    .innerJoin(
      evidenceItems,
      and(
        eq(evidenceItems.id, infraCaptureVersions.annotatedEvidenceId),
        eq(evidenceItems.organizationId, infraCaptureVersions.organizationId),
      ),
    )
    .where(
      and(
        eq(infraCaptureVersions.organizationId, organizationId),
        inArray(infraCaptureVersions.captureId, [...captureIds]),
        eq(evidenceItems.status, 'available'),
      ),
    )
    .orderBy(desc(infraCaptureVersions.version));
  for (const row of rows) {
    if (!result.has(row.captureId)) result.set(row.captureId, row.annotatedEvidenceId);
  }
  return result;
}

export async function listLatestMarkings(
  db: DbExecutor,
  organizationId: string,
  captureId: string,
  versionId: string,
): Promise<InfraMarkingDto[]> {
  const rows = await db
    .select()
    .from(infraMarkings)
    .where(
      and(
        eq(infraMarkings.organizationId, organizationId),
        eq(infraMarkings.captureId, captureId),
        eq(infraMarkings.versionId, versionId),
      ),
    )
    .orderBy(asc(infraMarkings.sortOrder));
  const markings: InfraMarkingDto[] = [];
  for (const row of rows) {
    const points = readMarkingGeometry(row.geometry);
    if (!points) continue;
    markings.push({
      id: row.id,
      kind: row.kind,
      points,
      label: row.label,
      infraType: row.infraType,
      color: row.color,
      sortOrder: row.sortOrder,
    });
  }
  return markings;
}

// ── comparisons ────────────────────────────────────────────────────────────────────────────────

export async function insertComparison(db: DbExecutor, row: typeof infraComparisons.$inferInsert): Promise<void> {
  await db.insert(infraComparisons).values(row);
}

export async function findComparisonRow(
  db: DbExecutor,
  organizationId: string,
  comparisonId: string,
): Promise<typeof infraComparisons.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(infraComparisons)
    .where(and(eq(infraComparisons.organizationId, organizationId), eq(infraComparisons.id, comparisonId)))
    .limit(1);
  return row ?? null;
}

export async function findComparisonByClientId(
  db: DbExecutor,
  organizationId: string,
  clientComparisonId: string,
): Promise<typeof infraComparisons.$inferSelect | null> {
  const [row] = await db
    .select()
    .from(infraComparisons)
    .where(
      and(eq(infraComparisons.organizationId, organizationId), eq(infraComparisons.clientComparisonId, clientComparisonId)),
    )
    .limit(1);
  return row ?? null;
}

export async function updateComparisonRow(
  db: DbExecutor,
  organizationId: string,
  comparisonId: string,
  patch: Partial<{
    sidecarConnectionId: string | null;
    sidecarExternalFileId: string | null;
    sidecarFileName: string | null;
    afterCaptureId: string | null;
    beforeCaptureId: string | null;
    resultEvidenceId: string | null;
    removedAt: Date | null;
    note: string | null;
  }>,
): Promise<boolean> {
  const rows = await db
    .update(infraComparisons)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(infraComparisons.organizationId, organizationId), eq(infraComparisons.id, comparisonId)))
    .returning({ id: infraComparisons.id });
  return rows.length === 1;
}

export async function listComparisonRows(
  db: DbExecutor,
  input: { organizationId: string; projectId: string; locationIds?: readonly string[]; taskId?: string; limit: number },
): Promise<InfraComparisonDto[]> {
  const conditions: (SQL | undefined)[] = [
    eq(infraComparisons.organizationId, input.organizationId),
    eq(infraComparisons.projectId, input.projectId),
    isNull(infraComparisons.removedAt),
  ];
  if (input.locationIds) {
    if (input.locationIds.length === 0) return [];
    conditions.push(inArray(infraComparisons.locationId, [...input.locationIds]));
  }
  if (input.taskId) conditions.push(eq(infraComparisons.taskId, input.taskId));
  const rows = await db
    .select({
      row: infraComparisons,
      userName: profiles.displayName,
      principalName: externalPrincipals.displayName,
    })
    .from(infraComparisons)
    .leftJoin(profiles, eq(profiles.id, infraComparisons.createdByUserId))
    .leftJoin(externalPrincipals, eq(externalPrincipals.id, infraComparisons.createdByPrincipalId))
    .where(and(...conditions))
    .orderBy(desc(infraComparisons.createdAt), desc(infraComparisons.id))
    .limit(input.limit);

  const captureIds = [
    ...new Set(rows.flatMap(({ row }) => [row.beforeCaptureId, row.afterCaptureId]).filter((id): id is string => Boolean(id))),
  ];
  const evidenceByCapture = new Map<string, string>();
  if (captureIds.length > 0) {
    const captureRows = await db
      .select({ id: infraCaptures.id, evidenceId: infraCaptures.evidenceId })
      .from(infraCaptures)
      .where(and(eq(infraCaptures.organizationId, input.organizationId), inArray(infraCaptures.id, captureIds)));
    for (const capture of captureRows) evidenceByCapture.set(capture.id, capture.evidenceId);
  }
  return rows.map(({ row, userName, principalName }) =>
    toComparisonDto(row, evidenceByCapture, { actorType: row.createdByActorType, userName, principalName }),
  );
}

export function toComparisonDto(
  row: typeof infraComparisons.$inferSelect,
  evidenceByCapture: ReadonlyMap<string, string>,
  actor: { actorType: 'internal' | 'external'; userName: string | null; principalName: string | null },
): InfraComparisonDto {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    locationId: row.locationId,
    taskId: row.taskId,
    mode: row.mode as InfraComparisonMode,
    beforeCaptureId: row.beforeCaptureId,
    beforeEvidenceId: row.beforeCaptureId ? (evidenceByCapture.get(row.beforeCaptureId) ?? null) : null,
    afterCaptureId: row.afterCaptureId,
    afterEvidenceId: row.afterCaptureId ? (evidenceByCapture.get(row.afterCaptureId) ?? null) : null,
    resultEvidenceId: row.resultEvidenceId,
    alignment: row.alignment,
    alignmentKind: row.alignmentKind,
    reliable: row.reliable,
    note: row.note,
    sidecarFileName: row.sidecarFileName,
    createdAt: row.createdAt.toISOString(),
    createdBy: actorOf(actor),
  };
}

// ── folder mappings (read; writes go through the service-role runner) ──────────────────────────

type FolderMappingRow = typeof infraFolderMappings.$inferSelect;

export function toFolderDto(row: FolderMappingRow): InfraFolderStatusDto {
  return {
    locationId: row.locationId,
    displayName: row.displayName,
    externalFolderId: row.externalFolderId,
    origin: row.origin,
    status: row.status,
    lastError: row.lastError,
  };
}

export async function listFolderMappingRows(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  connectionId?: string,
): Promise<FolderMappingRow[]> {
  return db
    .select()
    .from(infraFolderMappings)
    .where(
      and(
        eq(infraFolderMappings.organizationId, organizationId),
        eq(infraFolderMappings.projectId, projectId),
        ...(connectionId ? [eq(infraFolderMappings.connectionId, connectionId)] : []),
      ),
    );
}

export async function insertFolderMappingRow(db: DbExecutor, row: typeof infraFolderMappings.$inferInsert): Promise<void> {
  await db.insert(infraFolderMappings).values(row);
}

export async function updateFolderMappingRow(
  db: DbExecutor,
  organizationId: string,
  mappingId: string,
  patch: Partial<{
    externalFolderId: string;
    externalParentId: string | null;
    displayName: string;
    origin: 'auto' | 'linked_existing';
    status: 'pending' | 'ready' | 'error';
    lastError: string | null;
    lastVerifiedAt: Date | null;
  }>,
): Promise<void> {
  await db
    .update(infraFolderMappings)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(infraFolderMappings.organizationId, organizationId), eq(infraFolderMappings.id, mappingId)));
}

export async function deleteFolderMappingRow(db: DbExecutor, organizationId: string, mappingId: string): Promise<void> {
  await db
    .delete(infraFolderMappings)
    .where(and(eq(infraFolderMappings.organizationId, organizationId), eq(infraFolderMappings.id, mappingId)));
}

export type { FolderMappingRow };
