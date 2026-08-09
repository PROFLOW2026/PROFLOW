/** Public API of the portal module (doc 25). */
export { listCustomerGrants, listVendorGrants } from './application/list-grants';
export { createCustomerGrant } from './application/create-customer-grant';
export { createVendorGrant } from './application/create-vendor-grant';
export { revokeCustomerGrant, revokeVendorGrant } from './application/revoke-grant';
export { getCustomerSafeProjectSummary as getCustomerProjectSummary } from './application/get-customer-project-summary';
export { getCustomerSafeProjectSummary } from './application/get-customer-project-summary';

export {
  buildCustomerSafeProjectSummary,
  grantCoversProject,
  grantIsActive,
  isCustomerPortalScope,
  normalizeCustomerScopes,
  assertNoSensitiveCustomerFields,
} from './domain/safe-project-summary';

export {
  isVendorPortalScope,
  normalizeVendorScopes,
} from './domain/vendor-scopes';

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
  ExternalPrincipalRecord,
  ExternalAccessGrantRecord,
  ExternalAccessGrantListItem,
  CustomerSafeProjectSummary,
} from './domain/types';

export {
  createCustomerGrantSchema,
  createVendorGrantSchema,
  revokeGrantSchema,
  customerProjectSummarySchema,
} from './validation/schemas';
export type {
  CreateCustomerGrantInput,
  CreateVendorGrantInput,
  RevokeGrantInput,
  CustomerProjectSummaryInput,
} from './validation/schemas';
