import type { DbExecutor } from '@/shared/db/types';
import type { ResolvedDrawingLink } from '../domain/drawing-picker';
import { findDrawing, findRevision } from '../data/plans.repository';

export async function resolveDrawingLink(
  db: DbExecutor,
  organizationId: string,
  drawingId: string | null,
  drawingRevisionId: string | null,
): Promise<ResolvedDrawingLink | null> {
  if (!drawingId) return null;
  const drawing = await findDrawing(db, organizationId, drawingId);
  if (!drawing) return null;
  let revisionLabel: string | null = null;
  if (drawingRevisionId) {
    const revision = await findRevision(db, organizationId, drawingRevisionId);
    if (revision && revision.drawingId === drawing.id) {
      revisionLabel = revision.revisionLabel;
    }
  }
  return {
    drawingNumber: drawing.drawingNumber,
    title: drawing.title,
    revisionLabel,
  };
}
