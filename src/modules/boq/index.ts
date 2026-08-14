/** Public API of the optional BOQ module. */

export {
  BOQ_STATUSES,
  BOQ_PROGRESS_MODES,
  BOQ_NODE_KINDS,
  BOQ_PRICING_TYPES,
  BOQ_SUGGESTED_UNITS,
  BOQ_AUDIT_ACTIONS,
  BOQ_SUB_SCHEDULE_STATUSES,
  BOQ_SUB_VALUATION_STATUSES,
  CONTRACT_BOQ_RECON_STATUSES,
} from './domain/types';
export type {
  BoqStatus,
  BoqProgressMode,
  BoqNodeKind,
  BoqPricingType,
  BoqAllocationKind,
  BoqBatchStatus,
  BoqSubScheduleStatus,
  BoqSubValuationStatus,
  ContractBoqReconStatus,
} from './domain/types';

export {
  computeLineAmount,
  recomputeCurrentFromOriginal,
  percentComplete,
  remainingQuantity,
  assertWithinCurrentQuantity,
  assertQuantityReductionSafe,
  periodLineValue,
  parseQuantity,
  quantityString,
} from './domain/amounts';

export { reconcileContractBoq } from './domain/reconciliation';
export type { ContractBoqReconciliation } from './domain/reconciliation';

export {
  canEditBoqBaseline,
  canActivateBoq,
  canAllocateChange,
  canRecordProgress,
  canEditProgressBatch,
  canApproveProgressBatch,
  canCreateProgressBilling,
  isProgressHistoryLocked,
  canHardDeleteBoqNode,
} from './domain/lifecycle';

export { buildProgressCertificate } from './domain/progress-certificate';
export type { ProgressCertificateLine, ProgressCertificateSummary } from './domain/progress-certificate';

export {
  createProjectBoqSchema,
  upsertBoqNodeSchema,
  activateBoqSchema,
  createProgressBatchSchema,
  approveProgressBatchSchema,
  createProgressBillingSchema,
  allocateChangeToBoqSchema,
  updateBoqNodeMappingsSchema,
  createSubcontractorScheduleSchema,
  addSubcontractorScheduleLineSchema,
  createSubcontractorValuationSchema,
} from './validation/schemas';
export type {
  CreateProjectBoqInput,
  UpsertBoqNodeInput,
  ActivateBoqInput,
  CreateProgressBatchInput,
  ApproveProgressBatchInput,
  CreateProgressBillingInput,
  AllocateChangeToBoqInput,
  UpdateBoqNodeMappingsInput,
  CreateSubcontractorScheduleInput,
  AddSubcontractorScheduleLineInput,
  CreateSubcontractorValuationInput,
} from './validation/schemas';

export { createProjectBoq, upsertBoqNode, activateBoq, removeBoqNode, getProjectBoqWorkspace, listProjectChangeOrdersForBoqPanel } from './application/manage-boq';
export { createProgressBatch, approveProgressBatch, listBoqProgress, supersedeProgressBatch } from './application/manage-progress';
export { createProgressBilling } from './application/create-progress-billing';
export { allocateApprovedChangeToBoq, reverseBoqChangeAllocation } from './application/allocate-change';

export { sliceListWindow, sliceVirtualWindow, pageCount } from './domain/list-window';
export type { ListWindow } from './domain/list-window';
export { updateBoqNodeMappings } from './application/update-node-mappings';
export {
  createSubcontractorSchedule,
  addSubcontractorScheduleLine,
  createSubcontractorValuationDraft,
  approveSubcontractorValuation,
  activateSubcontractorSchedule,
  proposeSubcontractorValuationAp,
  voidSubcontractorValuation,
  listSubcontractorSchedulesForBoqWorkspace,
} from './application/manage-subcontractor-schedule';
export { getBoqFinancialComparison } from './application/compare-boq-financials';
export { findBoqById, listBoqNodes, listBoqsForProject } from './data/boq.repository';
export type { BoqFinancialComparison } from './application/compare-boq-financials';
