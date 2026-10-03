import './register-ports';

/**
 * RFI module (Developer / GC, Track KL). Operational only - no money.
 *
 * Internal (OrgContext + project capability `rfi.manage`; reads need `project.view`) and contractor
 * (ExternalContext + `ext.rfi.raise` on the RFI's vendor/agreement) use-cases, plus read models for the
 * Command Center (overdue) and the contractor portal (summary).
 */
export {
  RFI_ACTIONS,
  RFI_AWAITING_ANSWER_STATUSES,
  RFI_PRIORITIES,
  RFI_STATUSES,
  type RfiAction,
  type RfiActorType,
  type RfiAnswerView,
  type RfiDetail,
  type RfiHistoryEntry,
  type RfiListItem,
  type RfiPriority,
  type RfiStatus,
  type RfiStatusCounts,
} from './domain/types';
export {
  availableRfiActions,
  canRfiTransition,
  formatRfiNumber,
  isRfiAwaitingAnswer,
  isRfiContentEditable,
  isRfiOverdue,
  nextRfiStatus,
  rfiActionRequiresReason,
  rfiDaysOverdue,
  rfiStatusTone,
} from './domain/lifecycle';
export {
  answerRfi,
  closeRfi,
  createRfi,
  getRfi,
  listProjectRfis,
  reopenRfi,
  startRfiReview,
  submitRfi,
  updateRfi,
  type InternalRfiView,
  type RfiListResult,
} from './application/internal-rfi';
export {
  createContractorRfi,
  getContractorRfi,
  listContractorRfis,
  submitContractorRfi,
  updateContractorRfi,
  type ContractorRfiView,
} from './application/contractor-rfi';
export {
  countOverdueRfis,
  getContractorRfiSummary,
  listOverdueRfis,
  type ContractorRfiSummary,
  type OverdueRfiItem,
} from './application/queries';
export { loadRfiFormOptions, type RfiFormOptions } from './application/form-options';
export {
  assertProjectAssignee,
  coveringGrants,
  fieldError,
  listAssigneeOptions,
  parseOrThrow,
  recordExternalAuditEvent,
  requireScopedVendors,
  resolveAgreementVendor,
  scopedVendorIds,
  type AssigneeOption,
} from './application/support';
export {
  buildLocationOptions,
  listProjectAgreementOptions,
  listProjectContractors,
  listProjectLocationOptions,
  listProjectWorkPackageOptions,
  vendorNameMap,
  type AgreementOption,
  type LocationOption,
  type WorkPackageOption,
} from './data/project-options.repository';
export type {
  CreateExternalRfiInput,
  CreateInternalRfiInput,
  UpdateExternalRfiInput,
  UpdateInternalRfiInput,
} from './validation/schemas';
