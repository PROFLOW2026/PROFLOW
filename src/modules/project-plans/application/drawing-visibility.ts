import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { DbExecutor } from '@/shared/db/types';
import { NotFoundError } from '@/shared/errors';
import type { ExternalContext } from '@/shared/external';
import {
  listDistributionTargets,
  listDrawingDocumentLinks,
} from '../data/plans.repository';
import { contractorMayViewDrawing, type DrawingDistributionFact } from '../domain/visibility';

export interface StoredDrawingVisibilityRow {
  readonly id: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly status: string;
  readonly contractorVisibility: string;
  readonly currentRevisionId: string | null;
}

function distributionFor(
  drawingId: string,
  entries: readonly (DrawingDistributionFact & { readonly drawingId: string })[],
): readonly DrawingDistributionFact[] {
  return entries.filter((entry) => entry.drawingId === drawingId);
}

export function evaluateStoredDrawing(
  context: ExternalContext,
  drawing: StoredDrawingVisibilityRow,
  distribution: readonly DrawingDistributionFact[],
): boolean {
  return contractorMayViewDrawing({
    visibility: drawing.contractorVisibility,
    status: drawing.status,
    hasPublishedRevision: drawing.currentRevisionId != null,
    organizationId: drawing.organizationId,
    projectId: drawing.projectId,
    principalId: context.principalId,
    grants: context.grants,
    distribution,
  });
}

/** Service role loads distribution only so the predicate can run. The rows are not returned. */
export async function storedDrawingVisibleToContractor(
  context: ExternalContext,
  db: DbExecutor,
  drawing: StoredDrawingVisibilityRow,
): Promise<boolean> {
  const distribution =
    drawing.contractorVisibility === 'distribution'
      ? await asServiceRoleWrite(db, () => listDistributionTargets(db, drawing.organizationId, [drawing.id]))
      : [];
  return evaluateStoredDrawing(context, drawing, distribution);
}

export async function hiddenDrawingDocumentIds(
  context: ExternalContext,
  db: DbExecutor,
  input: { readonly organizationId: string; readonly projectId: string; readonly documentIds: readonly string[] },
): Promise<ReadonlySet<string>> {
  const documentIds = [...new Set(input.documentIds.filter((id) => id.length > 0))];
  if (documentIds.length === 0) return new Set();
  return asServiceRoleWrite(db, async () => {
    const links = await listDrawingDocumentLinks(db, input.organizationId, input.projectId, documentIds);
    if (links.length === 0) return new Set();
    const distributionIds = [
      ...new Set(links.filter((link) => link.contractorVisibility === 'distribution').map((link) => link.drawingId)),
    ];
    const entries = await listDistributionTargets(db, input.organizationId, distributionIds);
    const hidden = new Set<string>();
    const byDocument = new Map<string, typeof links>();
    for (const link of links) {
      const group = byDocument.get(link.documentId) ?? [];
      group.push(link);
      byDocument.set(link.documentId, group);
    }
    for (const [documentId, group] of byDocument) {
      const visible = group.some(
        (link) =>
          (link.revisionStatus === 'current' || link.revisionStatus === 'superseded') &&
          evaluateStoredDrawing(
            context,
            {
              id: link.drawingId,
              organizationId: input.organizationId,
              projectId: link.projectId,
              status: link.drawingStatus,
              contractorVisibility: link.contractorVisibility,
              currentRevisionId: link.currentRevisionId,
            },
            distributionFor(link.drawingId, entries),
          ),
      );
      if (!visible) hidden.add(documentId);
    }
    return hidden;
  });
}

/** Throws not-found before the caller opens bytes. A document that is not a drawing is left alone. */
export async function assertDrawingDocumentVisibleToContractor(
  context: ExternalContext,
  db: DbExecutor,
  input: { readonly organizationId: string; readonly projectId: string; readonly documentId: string },
  resource: string,
): Promise<void> {
  const hidden = await hiddenDrawingDocumentIds(context, db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    documentIds: [input.documentId],
  });
  if (hidden.has(input.documentId)) throw new NotFoundError(resource);
}

export async function omitDrawingsHiddenFromContractor<T extends { readonly documentId: string | null }>(
  context: ExternalContext,
  db: DbExecutor,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly files: readonly T[];
  },
): Promise<T[]> {
  const hidden = await hiddenDrawingDocumentIds(context, db, {
    organizationId: input.organizationId,
    projectId: input.projectId,
    documentIds: input.files.flatMap((file) => (file.documentId ? [file.documentId] : [])),
  });
  return input.files.filter((file) => !file.documentId || !hidden.has(file.documentId));
}
