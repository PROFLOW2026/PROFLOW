import { and, eq, sql } from 'drizzle-orm';
import { documents } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import { isKnownEntityType, resolveEntityScope } from '@/shared/entity-access';

/**
 * Core entity types a task may be linked to even when no track registered an entity-access
 * resolver for them (frozen foundation identities).
 */
const CORE_LINK_TYPES = [
  'project',
  'vendor',
  'project_location',
  'work_package',
  'subcontract_agreement',
  'subcontract_work_line',
  'document',
] as const;
type CoreLinkType = (typeof CORE_LINK_TYPES)[number];

const ENTITY_TYPE_RE = /^[a-z][a-z0-9_]*$/;

function isCoreLinkType(value: string): value is CoreLinkType {
  return (CORE_LINK_TYPES as readonly string[]).includes(value);
}

export function isLinkableEntityType(entityType: string): boolean {
  return ENTITY_TYPE_RE.test(entityType) && (isKnownEntityType(entityType) || isCoreLinkType(entityType));
}

async function coreEntityInProject(
  db: DbExecutor,
  entityType: CoreLinkType,
  organizationId: string,
  projectId: string,
  entityId: string,
): Promise<boolean> {
  if (entityType === 'document') {
    // Documents keep their own (category/permission) visibility: the caller must be able to read it.
    const rows = await db
      .select({ id: documents.id })
      .from(documents)
      .where(and(eq(documents.id, entityId), eq(documents.organizationId, organizationId)))
      .limit(1);
    return rows.length > 0;
  }
  // Existence-only check through a SECURITY DEFINER helper (migration 0160): operational users may
  // link a contract / work line without being able to read its financial columns.
  const result = await db.execute(
    sql`select app.dg_core_entity_in_project(${entityType}, ${organizationId}::uuid, ${projectId}::uuid, ${entityId}::uuid) as ok`,
  );
  const rows = Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? []);
  return (rows[0] as { ok?: boolean } | undefined)?.ok === true;
}

/**
 * True when the caller can see the entity and it belongs to the organization and, when
 * project-scoped, to the same project as the task.
 */
export async function entityBelongsToProject(
  db: DbExecutor,
  entityType: string,
  organizationId: string,
  projectId: string,
  entityId: string,
): Promise<boolean> {
  if (!ENTITY_TYPE_RE.test(entityType)) return false;
  // Core identities first: a registered resolver may apply stricter (e.g. financial) RLS that an
  // operational project member legitimately lacks.
  if (isCoreLinkType(entityType) && (await coreEntityInProject(db, entityType, organizationId, projectId, entityId))) {
    return true;
  }
  if (isKnownEntityType(entityType)) {
    const scope = await resolveEntityScope(db, entityType, organizationId, entityId);
    if (!scope || scope.organizationId !== organizationId) return false;
    return scope.projectId === null || scope.projectId === projectId;
  }
  return false;
}
