import type { DgCommandCenterQueryInput } from '@/modules/command-center';
import type { DgCommandCenterRow } from '@/modules/command-center/domain/dg-items';
import type { OrgContext } from '@/shared/auth/context';
import { listDefectsAwaitingVerification } from './query-defects';

/** Defects in completion_submitted waiting for an internal verifier. */
export async function queryDefectsAwaitingVerification(
  context: OrgContext,
  input: DgCommandCenterQueryInput,
): Promise<readonly DgCommandCenterRow[]> {
  if (input.projectIds.length === 0 || input.limit < 1) return [];
  const items = await listDefectsAwaitingVerification(context, {
    projectIds: input.projectIds,
    limit: input.limit,
  });
  return items.map((item) => ({
    id: item.defectId,
    projectId: item.projectId,
    projectName: item.projectName,
    vendorName: item.vendorName,
    reference: item.title.trim() ? `#${item.referenceNo} ${item.title}` : `#${item.referenceNo}`,
    since: item.submittedAt,
  }));
}
