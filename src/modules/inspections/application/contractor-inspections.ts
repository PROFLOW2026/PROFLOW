import { externalVendorsFor } from '@/modules/defects/application/contractor-defects';
import { AuthorizationError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES, type ExternalContext } from '@/shared/external';
import { listContractorInspectionRows } from '../data/inspections.repository';
import type { ContractorInspectionItem, InspectionListFilters } from '../domain/types';

/**
 * Contractor portal: the inspections relevant to the principal's own company (ext.inspection.view).
 * RLS (`quality_inspections_select`) enforces the same rule; the vendor filter keeps queries indexed.
 */
export async function listContractorInspections(
  context: ExternalContext,
  input: {
    readonly organizationId: string;
    readonly projectId: string;
    readonly filters?: Pick<InspectionListFilters, 'status' | 'outcome' | 'limit' | 'offset'>;
  },
): Promise<{ items: readonly ContractorInspectionItem[]; hasMore: boolean }> {
  const vendorIds = externalVendorsFor(
    context,
    input.organizationId,
    input.projectId,
    EXTERNAL_CAPABILITIES.INSPECTION_VIEW,
  );
  if (vendorIds.length === 0) throw new AuthorizationError(`external:${EXTERNAL_CAPABILITIES.INSPECTION_VIEW}`);
  return listContractorInspectionRows(context.db, input.organizationId, input.projectId, vendorIds, input.filters ?? {});
}
