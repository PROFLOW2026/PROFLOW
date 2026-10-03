/**
 * Contractor access (Track C): external contractor accounts, grants and sessions.
 *
 * Every external server action / page in every track starts with:
 *   const ctx = await requireExternalContext();
 *   requireExternalScope(ctx, { organizationId, vendorId, projectId, subcontractAgreementId }, EXTERNAL_CAPABILITIES.X);
 * and then queries ONLY through `ctx.db` (RLS-bound to the principal's auth user).
 */
import type { ExternalContext } from '@/shared/external';
import type { ExternalSessionState } from './application/session';

export type { ExternalSessionState };

/**
 * Contractor session accessor (FROZEN SIGNATURE). Redirects to `/contractor/sign-in` when the request
 * has no usable contractor session. The Next.js session plumbing is loaded lazily so domain modules
 * (and their unit / PGlite tests) can import this barrel without a request scope.
 */
export async function requireExternalContext(): Promise<ExternalContext> {
  const session = await import('./application/session');
  return session.requireExternalContext();
}

/** Non-redirecting variant (auth pages, layouts deciding what to render). */
export async function getExternalSessionState(): Promise<ExternalSessionState> {
  const session = await import('./application/session');
  return session.getExternalSessionState();
}

export {
  grantRowToView,
  listExternalDirectory,
  loadExternalContext,
  type ExternalDirectoryEntry,
  type ExternalSessionRejection,
  type LoadExternalContextResult,
} from './application/load-external-context';
export {
  externalAuditMetadata,
  recordExternalAuditEvent,
  writeExternalAuditEvent,
  type ExternalAuditInput,
} from './application/external-audit';
export { createRlsBoundExecutor, isRlsBoundExecutor } from './data/rls-executor';
export {
  CONTRACTOR_APP_METADATA_KEY,
  CONTRACTOR_APP_METADATA_VALUE,
  ContractorAuthNotConfiguredError,
  type ContractorAuthPort,
  type ContractorSignInResult,
} from './application/auth-port';
export {
  getContractorAccessOverview,
  grantContractorAccess,
  inviteContractor,
  issueContractorPasswordReset,
  loadContractorAccessAuthority,
  reissueContractorInvite,
  revokeContractorGrant,
  revokeContractorSessions,
  setContractorAccountDisabled,
  updateContractorGrantCapabilities,
  type ContractorAccessAuthority,
  type ContractorAccessDeps,
  type ContractorAccessOverview,
  type ContractorAccountSummary,
  type ContractorGrantSummary,
  type InviteContractorInput,
  type InviteContractorResult,
} from './application/manage-contractor-access';
export {
  ContractorPasswordPolicyError,
  activateContractorAccount,
  changeContractorPassword,
  getContractorAccount,
  inspectContractorToken,
  requestContractorPasswordReset,
  resetContractorPassword,
  signInContractor,
  updateContractorProfile,
  type ContractorAccountView,
  type ContractorAuthDeps,
  type ContractorSignInOutcome,
} from './application/contractor-auth';
export {
  CUSTOM_GRANT_TEMPLATE,
  GRANT_TEMPLATE_KEYS,
  GrantRuleError,
  resolveGrantCapabilities,
  type GrantTemplateChoice,
} from './domain/grant-policy';
export { checkContractorPassword, CONTRACTOR_PASSWORD_MIN_LENGTH, type PasswordRuleViolation } from './domain/password-policy';
export { contractorAuthEmail, isContractorAuthEmail, validateContractorUsername } from './domain/username';
export { hashThrottleKey } from './domain/rate-limit';
