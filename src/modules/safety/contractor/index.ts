/**
 * Contractor site safety (Track P) - additive layer over the existing safety module.
 * Import as `@/modules/safety/contractor`.
 */
export {
  listContractorSafety,
  getContractorSafety,
  reportContractorSafety,
  updateContractorSafetyStatus,
  addContractorCorrectiveAction,
  updateContractorCorrectiveActionStatus,
  closeContractorSafety,
} from './internal';
export {
  listContractorSafetyForPortal,
  getContractorSafetyForPortal,
  reportSafetyFromPortal,
  reportingVendorIds,
} from './external';
export {
  CONTRACTOR_SAFETY_RECORD_TYPES,
  SAFETY_RECORD_ENTITY,
  assertCanCloseContractorSafety,
  isContractorSafetyOverdue,
  resolveReportingVendor,
  taskPriorityForSeverity,
  type ContractorSafetyRecordType,
  type ContractorSafetyRecord,
  type ContractorSafetyAction,
  type ContractorSafetyDetail,
} from './domain';
export type {
  ReportContractorSafetyInput,
  ExternalSafetyReportInput,
  AddContractorCorrectiveActionInput,
  CloseContractorSafetyInput,
} from './schemas';
