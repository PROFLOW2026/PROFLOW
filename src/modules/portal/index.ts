/** Public API of the portal module (doc 25). */
export { listCustomerGrants } from './application/list-grants';
export { createCustomerGrant } from './application/create-customer-grant';
export { revokeCustomerGrant } from './application/revoke-grant';
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
  PORTAL_KINDS,
  GRANT_STATUSES,
  CUSTOMER_PORTAL_SCOPES,
} from './domain/types';
export type {
  PortalKind,
  GrantStatus,
  CustomerPortalScope,
  ExternalPrincipalRecord,
  ExternalAccessGrantRecord,
  ExternalAccessGrantListItem,
  CustomerSafeProjectSummary,
} from './domain/types';

export {
  createCustomerGrantSchema,
  revokeGrantSchema,
  customerProjectSummarySchema,
} from './validation/schemas';
export type {
  CreateCustomerGrantInput,
  RevokeGrantInput,
  CustomerProjectSummaryInput,
} from './validation/schemas';
