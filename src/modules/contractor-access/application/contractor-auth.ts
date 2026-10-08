import { sql } from 'drizzle-orm';
import { AUDIT_ACTIONS } from '@/shared/audit/actions';
import { externalActor } from '@/shared/actor';
import type { DbExecutor } from '@/shared/db/types';
import { DOMAIN_EVENTS, emitDomainEvent } from '@/shared/domain-events';
import { DomainRuleError } from '@/shared/errors';
import type { ExternalContext } from '@/shared/external';
import { isLocale } from '@/shared/i18n/config';
import {
  consumeContractorToken,
  countResetRequests,
  countSignInFailures,
  findContractorPrincipalById,
  findContractorPrincipalByUsername,
  findContractorTokenByHash,
  insertSignInAttempt,
  updateContractorPrincipal,
  type ContractorPrincipalRow,
  type ContractorTokenRow,
} from '../data/contractor-access.repository';
import { checkContractorPassword, type PasswordRuleViolation } from '../domain/password-policy';
import {
  MAX_RESET_REQUESTS_PER_USERNAME,
  SIGN_IN_WINDOW_MS,
  hashThrottleKey,
  isAccountLocked,
  isThrottled,
  nextFailureState,
} from '../domain/rate-limit';
import { hashContractorToken, isPlausibleToken, tokenState, type ContractorTokenPurpose } from '../domain/tokens';
import { normalizeContractorUsername } from '../domain/username';
import type { ContractorAuthPort } from './auth-port';
import { recordExternalAuditEvent, writeExternalAuditEvent } from './external-audit';

/**
 * Contractor-side account flows. Activation / sign-in / reset run BEFORE a session exists, on the
 * trusted service connection (`deps.db` = admin DB in production). Account-page flows run with an
 * ExternalContext and write audit through its RLS-bound executor.
 */

export interface ContractorAuthDeps {
  /** Trusted service connection (never an RLS-bound executor). */
  readonly db: DbExecutor;
  readonly auth: ContractorAuthPort;
  readonly now?: () => Date;
}

const now = (deps: { now?: () => Date }) => (deps.now ? deps.now() : new Date());

export class ContractorPasswordPolicyError extends DomainRuleError {
  constructor(readonly violations: readonly PasswordRuleViolation[]) {
    super('Password does not meet the policy', 'contractorAccess.errors.weak_password', { violations });
  }
}

const err = (key: string) => new DomainRuleError(key, `contractorAccess.errors.${key}`);

// ---------------------------------------------------------------------------
// Token flows (activate / reset)
// ---------------------------------------------------------------------------

export type TokenInspection =
  | { readonly ok: true; readonly username: string; readonly displayName: string | null }
  | { readonly ok: false; readonly reason: 'invalid' | 'expired' | 'used' };

async function resolveToken(
  db: DbExecutor,
  token: string,
  purpose: ContractorTokenPurpose,
  at: Date,
): Promise<{ token: ContractorTokenRow; principal: ContractorPrincipalRow } | TokenInspection> {
  if (!isPlausibleToken(token)) return { ok: false, reason: 'invalid' };
  const row = await findContractorTokenByHash(db, hashContractorToken(token));
  if (!row || row.purpose !== purpose) return { ok: false, reason: 'invalid' };
  const state = tokenState(row, at);
  if (state === 'expired') return { ok: false, reason: 'expired' };
  if (state !== 'valid') return { ok: false, reason: 'used' };
  const principal = await findContractorPrincipalById(db, row.principalId);
  if (!principal || principal.archivedAt || principal.status === 'disabled' || !principal.authUserId) {
    return { ok: false, reason: 'invalid' };
  }
  if (purpose === 'invite' && principal.status !== 'invited') return { ok: false, reason: 'used' };
  if (purpose === 'password_reset' && principal.status !== 'active') return { ok: false, reason: 'invalid' };
  return { token: row, principal };
}

/** For rendering the activate / reset pages (shows the username the contractor will sign in with). */
export async function inspectContractorToken(
  deps: Pick<ContractorAuthDeps, 'db' | 'now'>,
  token: string,
  purpose: ContractorTokenPurpose,
): Promise<TokenInspection> {
  const resolved = await resolveToken(deps.db, token, purpose, now(deps));
  if ('ok' in resolved) return resolved;
  return { ok: true, username: resolved.principal.username ?? '', displayName: resolved.principal.displayName };
}

export interface SetPasswordWithTokenInput {
  readonly token: string;
  readonly password: string;
  readonly confirmation: string;
}

export type SetPasswordWithTokenResult =
  | { readonly ok: true; readonly principalId: string; readonly username: string; readonly locale: string | null }
  | { readonly ok: false; readonly reason: 'invalid' | 'expired' | 'used' };

async function setPasswordWithToken(
  deps: ContractorAuthDeps,
  input: SetPasswordWithTokenInput,
  purpose: ContractorTokenPurpose,
): Promise<SetPasswordWithTokenResult> {
  const at = now(deps);
  const resolved = await resolveToken(deps.db, input.token, purpose, at);
  if ('ok' in resolved) return resolved as SetPasswordWithTokenResult;
  const { token, principal } = resolved;

  const violations = checkContractorPassword({
    password: input.password,
    confirmation: input.confirmation,
    username: principal.usernameNormalized,
  });
  if (violations.length > 0) throw new ContractorPasswordPolicyError(violations);

  const txCapable = deps.db as DbExecutor & {
    transaction: <T>(fn: (tx: DbExecutor) => Promise<T>) => Promise<T>;
  };
  const consumed = await txCapable.transaction(async (tx) => {
      if (!(await consumeContractorToken(tx, token.id, at))) return false;
      await updateContractorPrincipal(tx, principal.id, {
        status: 'active',
        passwordSetAt: at,
        failedSignInCount: 0,
        lockedUntil: null,
        passwordResetRequestedAt: null,
        ...(purpose === 'invite' ? { activatedAt: at } : {}),
        // A reset logs every other device out. Activation has no earlier sessions.
        ...(purpose === 'password_reset' ? { sessionsRevokedAt: at } : {}),
      });
      await writeExternalAuditEvent(tx, principal.id, {
        organizationId: token.organizationId,
        action:
          purpose === 'invite'
            ? AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_ACTIVATED
            : AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_PASSWORD_RESET_COMPLETED,
        entityType: 'external_principal',
        entityId: principal.id,
      });
      if (purpose === 'invite') {
        await emitDomainEvent(tx, {
          organizationId: token.organizationId,
          projectId: token.projectId,
          type: DOMAIN_EVENTS.EXTERNAL_PRINCIPAL_ACTIVATED,
          entityType: 'external_principal',
          entityId: principal.id,
          actor: externalActor(principal.id),
        });
      }
      // Inside the transaction: if Supabase rejects the password nothing above is committed.
      await deps.auth.setPassword(principal.authUserId!, input.password);
      return true;
    },
  );
  if (!consumed) return { ok: false, reason: 'used' };
  return { ok: true, principalId: principal.id, username: principal.usernameNormalized ?? '', locale: principal.locale };
}

export function activateContractorAccount(deps: ContractorAuthDeps, input: SetPasswordWithTokenInput) {
  return setPasswordWithToken(deps, input, 'invite');
}

export function resetContractorPassword(deps: ContractorAuthDeps, input: SetPasswordWithTokenInput) {
  return setPasswordWithToken(deps, input, 'password_reset');
}

// ---------------------------------------------------------------------------
// Sign-in (rate limited)
// ---------------------------------------------------------------------------

export interface ContractorSignInInput {
  readonly username: string;
  readonly password: string;
  /** Hash of the client IP (see `hashThrottleKey`); null when unknown. */
  readonly ipHash: string | null;
}

export type ContractorSignInOutcome =
  | { readonly ok: true; readonly principalId: string; readonly locale: string | null }
  | { readonly ok: false; readonly reason: 'invalid_credentials' | 'rate_limited' };

export async function signInContractor(
  deps: ContractorAuthDeps,
  input: ContractorSignInInput,
): Promise<ContractorSignInOutcome> {
  const at = now(deps);
  const username = normalizeContractorUsername(input.username);
  const usernameHash = hashThrottleKey(username);
  const record = (principalId: string | null, outcome: Parameters<typeof insertSignInAttempt>[1]['outcome']) =>
    insertSignInAttempt(deps.db, { kind: 'sign_in', usernameHash, ipHash: input.ipHash, principalId, outcome });

  const counts = await countSignInFailures(deps.db, {
    usernameHash,
    ipHash: input.ipHash,
    since: new Date(at.getTime() - SIGN_IN_WINDOW_MS),
  });
  if (isThrottled(counts)) {
    await record(null, 'rate_limited');
    return { ok: false, reason: 'rate_limited' };
  }

  const principal = username ? await findContractorPrincipalByUsername(deps.db, username) : null;
  if (!principal || !principal.authUserId) {
    await record(null, 'invalid_credentials');
    return { ok: false, reason: 'invalid_credentials' };
  }
  if (isAccountLocked(principal.lockedUntil, at)) {
    await record(principal.id, 'locked');
    return { ok: false, reason: 'rate_limited' };
  }
  if (principal.status !== 'active') {
    // Same answer as a wrong password: no account-state oracle before authentication.
    await record(principal.id, 'inactive');
    return { ok: false, reason: 'invalid_credentials' };
  }

  const result = await deps.auth.signInWithPassword(principal.email, input.password);
  if (!result.ok || result.authUserId !== principal.authUserId) {
    if (result.ok) await deps.auth.signOutCurrent();
    await updateContractorPrincipal(deps.db, principal.id, nextFailureState(principal.failedSignInCount, at));
    await record(principal.id, 'invalid_credentials');
    return { ok: false, reason: 'invalid_credentials' };
  }

  await updateContractorPrincipal(deps.db, principal.id, {
    failedSignInCount: 0,
    lockedUntil: null,
    lastSignInAt: at,
  });
  await record(principal.id, 'success');
  return { ok: true, principalId: principal.id, locale: principal.locale };
}

// ---------------------------------------------------------------------------
// Forgot password (self-service request; the home organization issues the reset link)
// ---------------------------------------------------------------------------

/**
 * Username accounts have no verified mailbox, so "forgot password" flags the account
 * (`password_reset_requested_at`) for the contractor's home organization, whose managers issue a
 * single-use reset link from Contractor access. Always answers the same way (no enumeration).
 */
export async function requestContractorPasswordReset(
  deps: Pick<ContractorAuthDeps, 'db' | 'now'>,
  input: { username: string; ipHash: string | null },
): Promise<void> {
  const at = now(deps);
  const username = normalizeContractorUsername(input.username);
  if (!username) return;
  const usernameHash = hashThrottleKey(username);
  const recent = await countResetRequests(deps.db, { usernameHash, since: new Date(at.getTime() - 60 * 60 * 1000) });
  if (recent >= MAX_RESET_REQUESTS_PER_USERNAME) return;
  const principal = await findContractorPrincipalByUsername(deps.db, username);
  await insertSignInAttempt(deps.db, {
    kind: 'password_reset_request',
    usernameHash,
    ipHash: input.ipHash,
    principalId: principal?.id ?? null,
    outcome: 'requested',
  });
  if (principal && principal.status === 'active') {
    await updateContractorPrincipal(deps.db, principal.id, { passwordResetRequestedAt: at });
  }
}

// ---------------------------------------------------------------------------
// Account page (signed-in contractor)
// ---------------------------------------------------------------------------

function contextOrganizations(context: ExternalContext): string[] {
  return [...new Set(context.grants.map((grant) => grant.organizationId))];
}

async function auditForEachOrganization(
  context: ExternalContext,
  action: (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS],
): Promise<void> {
  for (const organizationId of contextOrganizations(context)) {
    await recordExternalAuditEvent(context, {
      organizationId,
      action,
      entityType: 'external_principal',
      entityId: context.principalId,
    });
  }
}

export async function changeContractorPassword(
  context: ExternalContext,
  deps: ContractorAuthDeps,
  input: { currentPassword: string; newPassword: string; confirmation: string },
): Promise<void> {
  const principal = await findContractorPrincipalById(deps.db, context.principalId);
  if (!principal || principal.status !== 'active' || !principal.authUserId) throw err('not_active');
  if (!(await deps.auth.verifyPassword(principal.email, input.currentPassword))) throw err('wrong_current_password');
  const violations = checkContractorPassword({
    password: input.newPassword,
    confirmation: input.confirmation,
    username: principal.usernameNormalized,
  });
  if (input.newPassword === input.currentPassword) throw err('same_password');
  if (violations.length > 0) throw new ContractorPasswordPolicyError(violations);

  const at = now(deps);
  await deps.auth.setPassword(principal.authUserId, input.newPassword);
  // Other devices are signed out; this device signs in again right below with the new password.
  await updateContractorPrincipal(deps.db, principal.id, { passwordSetAt: at, sessionsRevokedAt: at });
  const signedIn = await deps.auth.signInWithPassword(principal.email, input.newPassword);
  if (!signedIn.ok) throw err('auth_error');
  await auditForEachOrganization(context, AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_PASSWORD_CHANGED);
}

export interface ContractorProfileInput {
  readonly displayName: string;
  readonly phone?: string | null;
  readonly locale: string;
}

export async function updateContractorProfile(context: ExternalContext, input: ContractorProfileInput): Promise<void> {
  if (!isLocale(input.locale)) throw err('invalid_locale');
  const displayName = input.displayName.trim();
  if (!displayName || displayName.length > 120) throw err('display_name_required');
  const phone = input.phone?.trim() ?? '';
  if (phone.length > 40) throw err('invalid_phone');
  await context.db.execute(sql`select app.external_update_own_profile(${displayName}, ${phone}, ${input.locale})`);
  await auditForEachOrganization(context, AUDIT_ACTIONS.EXTERNAL_PRINCIPAL_PROFILE_UPDATED);
}

export interface ContractorAccountView {
  readonly principalId: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly phone: string | null;
  readonly contactEmail: string | null;
  readonly locale: string | null;
  readonly lastSignInAt: Date | null;
  readonly passwordSetAt: Date | null;
}

/** Own account row through the RLS-bound executor (self-select policy). */
export async function getContractorAccount(context: ExternalContext): Promise<ContractorAccountView> {
  const row = await findContractorPrincipalById(context.db, context.principalId);
  if (!row) throw err('not_active');
  return {
    principalId: row.id,
    username: row.username ?? row.usernameNormalized ?? '',
    displayName: row.displayName,
    phone: row.phone,
    contactEmail: row.contactEmail,
    locale: row.locale,
    lastSignInAt: row.lastSignInAt,
    passwordSetAt: row.passwordSetAt,
  };
}
