import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import { ConflictError } from '@/shared/errors';

function rowsFromExecute(result: unknown): Record<string, unknown>[] {
  return (Array.isArray(result) ? result : ((result as { rows?: unknown[] }).rows ?? [])) as Record<
    string,
    unknown
  >[];
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
