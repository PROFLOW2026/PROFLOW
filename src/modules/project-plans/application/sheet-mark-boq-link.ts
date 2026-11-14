import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import { ConflictError, NotFoundError } from '@/shared/errors';

function rowsFromExecute(result: unknown): Record<string, unknown>[] {
  return (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[];
}

/**
 * Assert the BOQ line belongs to the organization's active BOQ for this project.
 * Rejects cross-project links and nodes on non-active / archived BOQs.
 */
export async function assertBoqNodeInActiveProjectBoq(
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  boqNodeId: string,
): Promise<void> {
  const result = await db.execute(sql`
    SELECT n.id
    FROM public.boq_nodes_secure n
    INNER JOIN public.project_boqs b
      ON b.id = n.boq_id
     AND b.organization_id = n.organization_id
    WHERE n.id = ${boqNodeId}::uuid
      AND n.organization_id = ${organizationId}::uuid
      AND n.archived_at IS NULL
      AND b.project_id = ${projectId}::uuid
      AND b.status = 'active'
      AND b.archived_at IS NULL
    LIMIT 1
  `);
  if (!rowsFromExecute(result)[0]) {
    throw new NotFoundError('BOQ node');
  }
}

/** Returns an existing mark id when this BOQ node is already linked on the revision. */
export async function findDuplicateBoqNodeSheetMark(
  db: DbExecutor,
  organizationId: string,
  drawingRevisionId: string,
  boqNodeId: string,
): Promise<string | null> {
  const result = await db.execute(sql`
    SELECT id
    FROM public.drawing_sheet_marks
    WHERE organization_id = ${organizationId}::uuid
      AND drawing_revision_id = ${drawingRevisionId}::uuid
      AND linked_entity_type = 'boq_node'
      AND linked_entity_id = ${boqNodeId}::uuid
    LIMIT 1
  `);
  const row = rowsFromExecute(result)[0];
  return row?.id != null ? String(row.id) : null;
}

export async function assertNoDuplicateBoqNodeLink(
  db: DbExecutor,
  organizationId: string,
  drawingRevisionId: string,
  boqNodeId: string,
): Promise<void> {
  const existing = await findDuplicateBoqNodeSheetMark(db, organizationId, drawingRevisionId, boqNodeId);
  if (existing) {
    throw new ConflictError('BOQ line already linked on this revision', 'projectPlans.sheetMarks.errors.boqAlreadyLinked');
  }
}
