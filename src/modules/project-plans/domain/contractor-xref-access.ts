import type { ExternalContext } from '@/shared/external';
import {
  contractorMayViewDrawing,
  type ContractorDrawingGrant,
  type DrawingDistributionFact,
} from './visibility';

/** Drawing facts needed to decide whether a contractor may load one XREF file. */
export type ContractorXrefDrawingFacts = {
  readonly drawingId: string;
  readonly organizationId: string;
  readonly projectId: string;
  readonly status: string;
  readonly contractorVisibility: string;
  readonly currentRevisionId: string | null;
};

export function contractorMayAccessXrefDrawing(
  context: Pick<ExternalContext, 'principalId' | 'grants'>,
  drawing: ContractorXrefDrawingFacts,
  distribution: readonly DrawingDistributionFact[],
  now?: Date,
): boolean {
  return contractorMayViewDrawing({
    visibility: drawing.contractorVisibility,
    status: drawing.status,
    hasPublishedRevision: drawing.currentRevisionId != null,
    organizationId: drawing.organizationId,
    projectId: drawing.projectId,
    principalId: context.principalId,
    grants: context.grants as readonly ContractorDrawingGrant[],
    distribution,
    now,
  });
}

/** Strict rule: no registered drawing with explicit contractor exposure = deny. */
export function contractorMayAccessUnlinkedXrefFile(): boolean {
  return false;
}