import 'server-only';

import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { DbExecutor } from '@/shared/db/types';
import type { ExternalContext } from '@/shared/external';
import { findStorageFileByExternalId } from '@/modules/external-storage/data/files.repository';
import {
  contractorMayAccessUnlinkedXrefFile,
  contractorMayAccessXrefDrawing,
  type ContractorXrefDrawingFacts,
} from '../domain/contractor-xref-access';
import { listDistributionTargets, listDrawingDocumentLinks } from '../data/plans.repository';
import type { DrawingDistributionFact } from '../domain/visibility';

type GateResult = 'allow' | 'hidden';

async function distributionForDrawing(
  db: DbExecutor,
  organizationId: string,
  drawingId: string,
  contractorVisibility: string,
): Promise<readonly DrawingDistributionFact[]> {
  if (contractorVisibility !== 'distribution') return [];
  const entries = await listDistributionTargets(db, organizationId, [drawingId]);
  return entries.filter((row) => row.drawingId === drawingId);
}

async function resolveOne(
  context: ExternalContext,
  db: DbExecutor,
  organizationId: string,
  projectId: string,
  connectionId: string,
  providerFileId: string,
): Promise<GateResult> {
  const link = await asServiceRoleWrite(db, () =>
    findStorageFileByExternalId(db, organizationId, connectionId, providerFileId),
  );
  if (!link?.documentId) return contractorMayAccessUnlinkedXrefFile() ? 'allow' : 'hidden';

  const links = await listDrawingDocumentLinks(db, organizationId, projectId, [link.documentId]);
  if (links.length === 0) return 'hidden';

  for (const row of links) {
    if (row.revisionStatus !== 'current' && row.revisionStatus !== 'superseded') continue;
    const drawing: ContractorXrefDrawingFacts = {
      drawingId: row.drawingId,
      organizationId,
      projectId: row.projectId,
      status: row.drawingStatus,
      contractorVisibility: row.contractorVisibility,
      currentRevisionId: row.currentRevisionId,
    };
    const distribution = await distributionForDrawing(db, organizationId, row.drawingId, row.contractorVisibility);
    if (contractorMayAccessXrefDrawing(context, drawing, distribution)) return 'allow';
  }
  return 'hidden';
}

/** Per-request cache for contractor XREF file visibility (strict exposure). */
export async function createContractorXrefFileGate(input: {
  context: ExternalContext;
  db: DbExecutor;
  organizationId: string;
  projectId: string;
  connectionId: string;
}): Promise<(providerFileId: string) => Promise<GateResult>> {
  const cache = new Map<string, GateResult>();
  return async (providerFileId: string) => {
    const cached = cache.get(providerFileId);
    if (cached) return cached;
    const result = await resolveOne(
      input.context,
      input.db,
      input.organizationId,
      input.projectId,
      input.connectionId,
      providerFileId,
    );
    cache.set(providerFileId, result);
    return result;
  };
}