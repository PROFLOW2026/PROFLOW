import { and, asc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { projectLocations } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { isLocationType, type LocationNode, type LocationType } from '../domain/locations';

export interface LocationRecord extends LocationNode {
  readonly organizationId: string;
  readonly projectId: string;
  readonly archivedAt: Date | null;
}

const LOCATION_COLUMNS = {
  id: projectLocations.id,
  organizationId: projectLocations.organizationId,
  projectId: projectLocations.projectId,
  parentId: projectLocations.parentId,
  name: projectLocations.name,
  code: projectLocations.code,
  type: projectLocations.type,
  sortOrder: projectLocations.sortOrder,
  isActive: projectLocations.isActive,
  archivedAt: projectLocations.archivedAt,
};

type LocationRow = {
  id: string;
  organizationId: string;
  projectId: string;
  parentId: string | null;
  name: string;
  code: string | null;
  type: string;
  sortOrder: number;
  isActive: boolean;
  archivedAt: Date | null;
};

function mapLocation(row: LocationRow): LocationRecord {
  return {
    id: row.id,
    organizationId: row.organizationId,
    projectId: row.projectId,
    parentId: row.parentId,
    name: row.name,
    code: row.code,
    type: isLocationType(row.type) ? row.type : 'other',
    sortOrder: row.sortOrder,
    isActive: row.isActive,
    archived: row.archivedAt !== null,
    archivedAt: row.archivedAt,
  };
}

/** Whole tree of one project (indexed by (org, project, parent, sort)). */
export async function listProjectLocations(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  options: { includeArchived?: boolean } = {},
): Promise<LocationRecord[]> {
  const conditions = [
    eq(projectLocations.organizationId, organizationId),
    eq(projectLocations.projectId, projectId),
  ];
  if (!options.includeArchived) conditions.push(isNull(projectLocations.archivedAt));
  const rows = await db
    .select(LOCATION_COLUMNS)
    .from(projectLocations)
    .where(and(...conditions))
    .orderBy(asc(projectLocations.parentId), asc(projectLocations.sortOrder), asc(projectLocations.name));
  return rows.map(mapLocation);
}

export async function countProjectLocations(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
        isNull(projectLocations.archivedAt),
      ),
    );
  return row?.count ?? 0;
}

export async function findProjectLocation(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  locationId: string,
): Promise<LocationRecord | null> {
  const [row] = await db
    .select(LOCATION_COLUMNS)
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.id, locationId),
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
      ),
    )
    .limit(1);
  return row ? mapLocation(row) : null;
}

/** Locations by id within an organization (any project) - for label lookups of other tracks. */
export async function findLocationsByIds(
  db: DbExecutor,
  organizationId: string,
  ids: readonly string[],
): Promise<LocationRecord[]> {
  if (ids.length === 0) return [];
  const rows = await db
    .select(LOCATION_COLUMNS)
    .from(projectLocations)
    .where(and(eq(projectLocations.organizationId, organizationId), inArray(projectLocations.id, [...ids])));
  return rows.map(mapLocation);
}

export interface NewLocationRow {
  readonly id?: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly parentId: string | null;
  readonly type: LocationType;
  readonly name: string;
  readonly code: string | null;
  readonly sortOrder: number;
  readonly createdByUserId: string;
  readonly metadata?: Record<string, unknown>;
}

export async function insertLocations(db: DbExecutor, rows: readonly NewLocationRow[]): Promise<string[]> {
  if (rows.length === 0) return [];
  const inserted = await db
    .insert(projectLocations)
    .values(
      rows.map((row) => ({
        ...(row.id ? { id: row.id } : {}),
        organizationId: row.organizationId,
        projectId: row.projectId,
        parentId: row.parentId,
        type: row.type,
        name: row.name,
        code: row.code,
        sortOrder: row.sortOrder,
        createdByUserId: row.createdByUserId,
        metadata: row.metadata ?? {},
      })),
    )
    .returning({ id: projectLocations.id });
  return inserted.map((row) => row.id);
}

export async function updateProjectLocation(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  locationId: string,
  patch: Partial<{
    parentId: string | null;
    type: LocationType;
    name: string;
    code: string | null;
    sortOrder: number;
    isActive: boolean;
    archivedAt: Date | null;
  }>,
): Promise<LocationRecord | null> {
  const [row] = await db
    .update(projectLocations)
    .set({ ...patch, updatedAt: new Date() })
    .where(
      and(
        eq(projectLocations.id, locationId),
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
      ),
    )
    .returning(LOCATION_COLUMNS);
  return row ? mapLocation(row) : null;
}

export async function setLocationsArchived(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  ids: readonly string[],
  archivedAt: Date | null,
): Promise<number> {
  if (ids.length === 0) return 0;
  const rows = await db
    .update(projectLocations)
    .set({ archivedAt, updatedAt: new Date() })
    .where(
      and(
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
        inArray(projectLocations.id, [...ids]),
      ),
    )
    .returning({ id: projectLocations.id });
  return rows.length;
}

/** Lower-cased active codes among the children of `parentId` (null = roots). */
export async function listSiblingCodes(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  parentId: string | null,
): Promise<Set<string>> {
  const rows = await db
    .select({ code: projectLocations.code })
    .from(projectLocations)
    .where(
      and(
        eq(projectLocations.organizationId, organizationId),
        eq(projectLocations.projectId, projectId),
        parentId ? eq(projectLocations.parentId, parentId) : isNull(projectLocations.parentId),
        isNull(projectLocations.archivedAt),
      ),
    );
  return new Set(rows.map((row) => row.code?.toLowerCase()).filter((code): code is string => Boolean(code)));
}
