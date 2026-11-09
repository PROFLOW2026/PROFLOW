import type { OrgContext } from '@/shared/auth/context';
import { assertProjectCapability, PROJECT_CAPABILITIES } from '@/modules/project-team';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { ExternalContext } from '@/shared/external';
import type { DrawingPickerOption, DrawingPickerRevision } from '../domain/drawing-picker';
import { listDrawingsForProject, listPublishedRevisionsForDrawings } from '../data/plans.repository';
import { listContractorPlans } from './contractor-plans';

function groupRevisions(
  rows: readonly { readonly id: string; readonly drawingId: string; readonly revisionLabel: string; readonly status: DrawingPickerOption['revisions'][number]['status'] }[],
): Map<string, DrawingPickerOption['revisions']> {
  const map = new Map<string, DrawingPickerRevision[]>();
  for (const row of rows) {
    const list = map.get(row.drawingId) ?? [];
    list.push({ id: row.id, label: row.revisionLabel, status: row.status });
    map.set(row.drawingId, list);
  }
  return map;
}

/** Active drawings with published revisions (`documents.view` on the project). */
export async function listInternalDrawingPickerOptions(
  context: OrgContext,
  projectId: string,
): Promise<readonly DrawingPickerOption[]> {
  await assertProjectCapability(context, projectId, PROJECT_CAPABILITIES.DOCUMENTS_VIEW);
  const drawings = await listDrawingsForProject(context.db, {
    organizationId: context.organizationId,
    projectId,
    status: 'active',
  });
  const drawingIds = drawings.map((drawing) => drawing.id);
  const revisionRows = await listPublishedRevisionsForDrawings(context.db, context.organizationId, drawingIds);
  const byDrawing = groupRevisions(revisionRows);
  return drawings
    .map((drawing) => {
      const revisions = byDrawing.get(drawing.id) ?? [];
      if (revisions.length === 0) return null;
      return {
        drawingId: drawing.id,
        drawingNumber: drawing.drawingNumber,
        title: drawing.title,
        revisions,
      };
    })
    .filter((item): item is DrawingPickerOption => item !== null);
}

/** Drawings visible to the contractor plus their published revisions. */
export async function listContractorDrawingPickerOptions(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string },
): Promise<readonly DrawingPickerOption[]> {
  const { items } = await listContractorPlans(context, input);
  const drawingIds = items.map((item) => item.drawingId);
  const revisionRows = await asServiceRoleWrite(context.db, () =>
    listPublishedRevisionsForDrawings(context.db, input.organizationId, drawingIds),
  );
  const byDrawing = groupRevisions(revisionRows);
  return items
    .map((item) => {
      const revisions = byDrawing.get(item.drawingId) ?? [];
      if (revisions.length === 0) return null;
      return {
        drawingId: item.drawingId,
        drawingNumber: item.drawingNumber,
        title: item.title,
        revisions,
      };
    })
    .filter((option): option is DrawingPickerOption => option !== null);
}
