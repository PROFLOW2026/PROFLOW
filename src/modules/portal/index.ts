/** Public API of the portal module (doc 25). */
export { listCustomerGrants, listVendorGrants } from './application/list-grants';
export { createCustomerGrant } from './application/create-customer-grant';
export { createVendorGrant } from './application/create-vendor-grant';
export { revokeCustomerGrant, revokeVendorGrant } from './application/revoke-grant';
export { getCustomerSafeProjectSummary as getCustomerProjectSummary } from './application/get-customer-project-summary';
export {
  getCustomerSafeProjectSummary,
  previewCustomerPortalAccess,
} from './application/get-customer-project-summary';
export type {
  CustomerPortalPreviewResult,
  CustomerPortalDenialReason,
} from './application/get-customer-project-summary';
export { getVendorPortalPreview } from './application/get-vendor-portal-preview';
export {
  submitVendorQuoteCandidate,
  recordVendorQuoteOnBehalf,
} from './application/submit-vendor-quote-candidate';
export { submitVendorApBillCandidate } from './application/submit-vendor-ap-candidate';
export { submitVendorComplianceCandidate } from './application/submit-vendor-compliance-candidate';
export {
  reviewVendorPortalCandidate,
  listVendorPortalCandidatesForOrg,
} from './application/review-vendor-candidate';
export type { ReviewVendorCandidateInput } from './application/review-vendor-candidate';

export {
  buildCustomerSafeProjectSummary,
  buildCustomerSafeDocuments,
  buildCustomerPortalSession,
  isCustomerPortalSession,
  grantCoversProject,
  grantIsActive,
  isCustomerPortalScope,
  normalizeCustomerScopes,
  assertNoSensitiveCustomerFields,
  CUSTOMER_PORTAL_NEVER_EXPOSED,
} from './domain/safe-project-summary';

export {
  isVendorPortalScope,
  normalizeVendorScopes,
  assertVendorScopesAreReadOnly,
} from './domain/vendor-scopes';

export {
  assertCandidateQuoteStatus,
  assertNoSensitiveVendorFields,
  assertPortalCandidateDoesNotMutateFinancialTruth,
  assertVendorGrantActive,
  assertVendorGrantHasScope,
  buildVendorPortalSession,
  buildVendorSafePoSummary,
  buildVendorSafeRfqSummary,
  grantHasVendorScope,
  isVendorPortalSession,
  isVendorVisiblePoStatus,
  portalCandidateMutatesFinancialTruth,
} from './domain/safe-vendor-projection';

export {
  PORTAL_KINDS,
  GRANT_STATUSES,
  CUSTOMER_PORTAL_SCOPES,
  VENDOR_PORTAL_SCOPES,
} from './domain/types';
export type {
  PortalKind,
  GrantStatus,
  CustomerPortalScope,
  VendorPortalScope,
  CustomerPortalSession,
  VendorPortalSession,
  ExternalPrincipalRecord,
  ExternalAccessGrantRecord,
  ExternalAccessGrantListItem,
  CustomerSafeProjectSummary,
  CustomerSafeDocument,
  VendorSafeRfqSummary,
  VendorSafePoSummary,
  VendorPortalPreview,
  VendorApBillCandidate,
  VendorComplianceUploadCandidate,
} from './domain/types';

export {
  createCustomerGrantSchema,
  createVendorGrantSchema,
  revokeGrantSchema,
  customerProjectSummarySchema,
  vendorPortalPreviewSchema,
  submitVendorQuoteCandidateSchema,
  recordVendorQuoteOnBehalfSchema,
  submitVendorApBillCandidateSchema,
  submitVendorComplianceCandidateSchema,
} from './validation/schemas';
export type {
  CreateCustomerGrantInput,
  CreateVendorGrantInput,
  RevokeGrantInput,
  CustomerProjectSummaryInput,
  VendorPortalPreviewInput,
  SubmitVendorQuoteCandidateInput,
  RecordVendorQuoteOnBehalfInput,
  SubmitVendorApBillCandidateInput,
  SubmitVendorComplianceCandidateInput,
} from './validation/schemas';
