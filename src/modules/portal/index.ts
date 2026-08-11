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
  buildCustomerSafeMilestones,
  buildCustomerSafeBillingItems,
  buildCustomerSafeQuotes,
  buildCustomerPortalSession,
  isCustomerPortalSession,
  grantCoversProject,
  grantIsActive,
  isCustomerPortalScope,
  normalizeCustomerScopes,
  assertNoSensitiveCustomerFields,
  CUSTOMER_PORTAL_NEVER_EXPOSED,
  CUSTOMER_VISIBLE_QUOTE_STATUSES,
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
  buildVendorSafePaymentOutstanding,
  buildVendorSafePoSummary,
  buildVendorSafeRfqSummary,
  grantHasVendorScope,
  isVendorPortalSession,
  isVendorVisiblePoStatus,
  isVendorPaymentOutstandingPolicyEnabled,
  portalCandidateMutatesFinancialTruth,
  VENDOR_PAYMENT_OUTSTANDING_POLICY,
} from './domain/safe-vendor-projection';

export {
  getExternalPublicAccessStatus,
  isExternalPublicAccessEnabled,
  assertExternalPublicAccessEnabled,
  EXTERNAL_PUBLIC_ACCESS_STATUS,
  EXTERNAL_PUBLIC_ACCESS_LIMITATION,
} from './domain/external-access-policy';

export {
  PORTAL_CANDIDATES_PERSISTENCE_READY,
  arePortalCandidatesAvailable,
  setPortalCandidatesPersistenceReadyForTests,
} from './domain/candidates-persistence';

export {
  assertVendorSameOrg,
  assertGrantSameOrgAndPrincipal,
} from './data/candidate-same-org-guards';

export {
  drizzleVendorPortalCandidatesRepository,
  type VendorPortalCandidatesRepository,
} from './data/vendor-portal-candidates.repository';

export {
  resetVendorPortalCandidateStoreForTests,
  insertVendorApBillCandidate,
  reviewVendorApBillCandidate,
} from './data/vendor-portal-candidates.store';

export {
  getVendorPortalCandidatesRepository,
  setVendorPortalCandidatesRepositoryForTests,
  insertVendorApBillCandidateRow,
  insertVendorComplianceCandidateRow,
} from './data/vendor-portal-candidates';

export {
  assertGrantBelongsToOrganization,
  assertSameOrganization,
  grantMatchesOrganization,
} from './domain/tenant-isolation';

export {
  CUSTOMER_PORTAL_SHARED_LABEL,
  isCustomerPortalSharedLabel,
  isCustomerPortalSharedDocument,
  filterCustomerPortalSharedDocuments,
} from './domain/shared-documents';

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
  CustomerSafeMilestone,
  CustomerSafeBillingItem,
  VendorSafeRfqSummary,
  VendorSafePoSummary,
  VendorSafePaymentOutstanding,
  VendorPortalPreview,
  VendorApBillCandidate,
  VendorComplianceUploadCandidate,
  CustomerSafeQuote,
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
