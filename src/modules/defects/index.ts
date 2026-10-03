import './register-ports';

/** Public API for the Defects / punch list module (Developer/GC, Track MN). */

export {
  DEFECT_ACTIVE_STATUSES,
  DEFECT_AWAITING_VERIFICATION_STATUSES,
  DEFECT_MODES,
  DEFECT_SEVERITIES,
  DEFECT_STATUSES,
  DEFECT_TRANSITIONS,
  allowedDefectActions,
  canTransition,
  isDefectOverdue,
  planDefectStep,
  type DefectAction,
  type DefectCycleRecordKind,
  type DefectMode,
  type DefectSeverity,
  type DefectStatus,
  type DefectStatusFilter,
} from './domain/lifecycle';
export type {
  ContractorQualitySummary,
  DefectAwaitingVerificationItem,
  DefectCycleRecordView,
  DefectDetail,
  DefectListFilters,
  DefectListItem,
  DefectListPage,
  DefectStatusCounts,
} from './domain/types';
export { computeContractorQualityMetrics, type ContractorQualityMetrics } from './domain/metrics';
export { projectVendorNames, resolveQualityRefs } from './data/quality-refs.repository';

export {
  assignDefect,
  cancelDefect,
  createDefect,
  reopenDefect,
  startDefectVerification,
  submitDefectCompletionInternal,
  updateDefect,
  verifyDefect,
  DEFECT_VERIFY_CAPABILITIES,
} from './application/manage-defects';
export {
  countProjectDefects,
  getContractorQualityMetrics,
  getContractorQualityMetricsBatch,
  getDefectDetail,
  getDefectPermissions,
  listDefectsAwaitingVerification,
  listProjectDefects,
  loadQualityFormData,
  type DefectDetailView,
  type DefectPermissions,
  type QualityFormData,
  type QualityPersonOption,
} from './application/query-defects';
export {
  getContractorDefect,
  getContractorQualitySummary,
  listContractorDefects,
  resolveContractorProjectOrganization,
  submitDefectCompletion,
} from './application/contractor-defects';
export type {
  AssignDefectInput,
  CreateDefectInput,
  UpdateDefectInput,
  VerifyDefectInput,
} from './validation/schemas';
