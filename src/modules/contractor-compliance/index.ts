import './register-ports';

/**
 * Contractor compliance (Track P). Requirement sets per subcontract agreement, contractor submissions
 * with internal review, expiry reminders and the payment-eligibility port for Track F.
 * No UI here - import components from `./ui`.
 */

// Payment-eligibility port (Track F claims / payment holds)
export { getPaymentEligibilityInputs, type PaymentEligibilityOptions } from './application/eligibility';
export {
  evaluatePaymentEligibility,
  isRequirementBlocking,
  type EligibilityRequirementInput,
  type PaymentEligibilityInputs,
  type PaymentEligibilityRequirement,
} from './domain/eligibility';

// Internal use-cases (OrgContext + project capabilities)
export {
  getProjectComplianceOverview,
  listReusableArtifacts,
  createComplianceRequirement,
  applyStandardRequirementSet,
  updateComplianceRequirement,
  archiveComplianceRequirement,
  submitInternalComplianceDocument,
  reviewComplianceDocument,
  organizationToday,
  type ProjectComplianceOverview,
} from './application/internal';

// Contractor portal (ExternalContext + ext.compliance.submit)
export {
  getContractorCompliance,
  getContractorComplianceSummary,
  submitContractorComplianceDocument,
  externalProjectGate,
  EXTERNAL_DEFAULT_TIMEZONE,
  type ContractorComplianceView,
  type ContractorAgreementCompliance,
} from './application/external';
export { recordExternalAudit } from './application/external-audit';
/** Operational agreement scope (no money columns) - shared with safety / deliveries (Track P). */
export {
  findAgreementScope,
  listProjectAgreements,
  type AgreementScopeRow,
} from './data/compliance.repository';

// Reminders (system scan for Track T) + Command Center feed
export {
  runComplianceExpiryScan,
  type ComplianceExpiryScanOptions,
  type ComplianceExpiryScanResult,
} from './application/reminders';
export { listExpiringComplianceForOrg, type ExpiringComplianceItem } from './application/queries';

// Domain
export {
  computeRequirementStatus,
  countStatuses,
  isBlockingStatus,
  daysBetween,
  addDays,
  COMPLIANCE_STATUS_PRIORITY,
} from './domain/status';
export { STANDARD_REQUIREMENT_SET, missingStandardKinds } from './domain/standard-set';
export { assertReviewDecision, assertSubmissionDates } from './domain/review';
export { evaluateRequirements, buildAgreementViews } from './domain/views';
export {
  COMPLIANCE_REQUIREMENT_KINDS,
  COMPLIANCE_STATUSES,
  COMPLIANCE_REVIEW_STATUSES,
  COMPLIANCE_DOCUMENT_ENTITY,
  type ComplianceRequirementKind,
  type ComplianceStatus,
  type ComplianceReviewStatus,
  type ComplianceRequirementRecord,
  type ComplianceDocumentRecord,
  type RequirementStatusResult,
  type RequirementWithStatus,
  type AgreementComplianceView,
} from './domain/types';

export type {
  CreateRequirementInput,
  UpdateRequirementInput,
  ApplyStandardSetInput,
  SubmitDocumentInput,
  InternalSubmitDocumentInput,
  ReviewDocumentInput,
} from './validation/schemas';
