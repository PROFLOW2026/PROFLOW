import { externalVendorsFor } from '@/modules/defects/application/contractor-defects';
import { AuthorizationError, NotFoundError } from '@/shared/errors';
import { EXTERNAL_CAPABILITIES, type ExternalContext } from '@/shared/external';
import { findInspectionRow, listContractorInspectionRows, loadInspectionDetail } from '../data/inspections.repository';
import type { ContractorInspectionItem, InspectionItemView, InspectionListFilters } from '../domain/types';

export interface ContractorInspectionDetail extends ContractorInspectionItem {
  readonly items: readonly InspectionItemView[];
}

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

/** Contractor portal: one inspection scoped to the principal's vendor (RLS + vendor filter). */
export async function getContractorInspection(
  context: ExternalContext,
  input: { readonly organizationId: string; readonly projectId: string; readonly inspectionId: string },
): Promise<ContractorInspectionDetail> {
  const vendorIds = externalVendorsFor(
    context,
    input.organizationId,
    input.projectId,
    EXTERNAL_CAPABILITIES.INSPECTION_VIEW,
  );
  if (vendorIds.length === 0) throw new AuthorizationError(`external:${EXTERNAL_CAPABILITIES.INSPECTION_VIEW}`);
  const row = await findInspectionRow(context.db, input.organizationId, input.inspectionId);
  if (
    !row ||
    row.projectId !== input.projectId ||
    !row.contractorVisible ||
    !row.vendorId ||
    !vendorIds.includes(row.vendorId)
  ) {
    throw new NotFoundError('Inspection');
  }
  const detail = await loadInspectionDetail(context.db, row);
  const failedItems = detail.items
    .filter((item) => item.result === 'fail')
    .map((item) => ({ itemKey: item.itemKey, label: item.label, note: item.note }));
  return {
    id: detail.id,
    referenceNo: detail.referenceNo,
    title: detail.title,
    category: detail.category,
    templateKey: detail.templateKey,
    status: detail.status,
    outcome: detail.outcome,
    attemptNo: detail.attemptNo,
    scheduledFor: detail.scheduledFor,
    completedAt: detail.completedAt,
    locationName: detail.location?.name ?? null,
    summary: detail.summary,
    conditions: detail.conditions,
    failedItems,
    items: detail.items,
  };
}
