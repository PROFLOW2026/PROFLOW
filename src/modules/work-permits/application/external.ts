import { EXTERNAL_CAPABILITIES as X, type ExternalContext } from '@/shared/external';
import { externalProjectGate } from '@/modules/contractor-compliance';
import type { WorkPermitRecord } from '../domain/types';
import { listWorkPermitsForProject } from '../data/work-permits.repository';

/** Read-only portal list when the principal holds ext.safety.report on the project. */
export async function listWorkPermitsForPortal(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string },
): Promise<readonly WorkPermitRecord[]> {
  externalProjectGate(context, input.organizationId, input.projectId, X.SAFETY_REPORT);
  return listWorkPermitsForProject(context.db, input.organizationId, input.projectId);
}
