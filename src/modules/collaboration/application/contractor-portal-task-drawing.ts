import { storedDrawingVisibleToContractor } from '@/modules/project-plans/application/drawing-visibility';
import { findDrawing, findRevision } from '@/modules/project-plans/data/plans.repository';
import { asServiceRoleWrite } from '@/shared/db';
import {
  EXTERNAL_CAPABILITIES as X,
  hasExternalScope,
  type ExternalContext,
} from '@/shared/external';
import { listTaskEntityLinks } from '../data/collaboration.repository';

export interface ContractorPortalTaskDrawingLink {
  readonly drawingId: string;
  readonly label: string;
}

/** First task-linked drawing the contractor may open on the project (entity_links; service-role read). */
export async function resolveContractorPortalTaskDrawingLink(
  context: ExternalContext,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly taskId: string;
    readonly vendorId: string;
    readonly subcontractAgreementId: string | null;
  },
): Promise<ContractorPortalTaskDrawingLink | null> {
  const scope = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    vendorId: input.vendorId,
    subcontractAgreementId: input.subcontractAgreementId,
  };
  if (!hasExternalScope(context, scope, X.PLAN_VIEW)) return null;

  const links = await asServiceRoleWrite(context.db, () =>
    listTaskEntityLinks(context.db, input.organizationId, input.taskId),
  );
  for (const link of links) {
    if (link.entityType === 'drawing') {
      const resolved = await drawingIfVisible(context, input.organizationId, input.projectId, link.entityId);
      if (resolved) return resolved;
      continue;
    }
    if (link.entityType === 'drawing_revision') {
      const revision = await asServiceRoleWrite(context.db, () =>
        findRevision(context.db, input.organizationId, link.entityId),
      );
      if (!revision) continue;
      const resolved = await drawingIfVisible(context, input.organizationId, input.projectId, revision.drawingId);
      if (resolved) return resolved;
    }
  }
  return null;
}

async function drawingIfVisible(
  context: ExternalContext,
  organizationId: string,
  projectId: string,
  drawingId: string,
): Promise<ContractorPortalTaskDrawingLink | null> {
  const drawing = await asServiceRoleWrite(context.db, () => findDrawing(context.db, organizationId, drawingId));
  if (!drawing || drawing.projectId !== projectId) return null;
  if (!(await storedDrawingVisibleToContractor(context, context.db, drawing))) return null;
  return {
    drawingId: drawing.id,
    label: `${drawing.drawingNumber} · ${drawing.title}`,
  };
}
