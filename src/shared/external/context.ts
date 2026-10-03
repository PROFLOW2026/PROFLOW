import { AuthorizationError } from '@/shared/errors';
import type { DbExecutor } from '@/shared/db/types';
import type { ExternalCapability } from './capabilities';

/**
 * ExternalContext - the external counterpart of OrgContext (FROZEN CONTRACT, MAIN AGENT owned).
 *
 * An external contractor is an `external_principals` row (own Supabase auth user, username +
 * password). It is NOT an employee, NOT an organization member, and never receives an OrgContext.
 * The context is produced by the external session loader (track B: `loadExternalContext`) and carries an
 * RLS-bound executor whose JWT subject is the principal's auth user, so the `app.external_*`
 * policies in migration 0155 apply to every query.
 *
 * Every external use-case in every track MUST start with `requireExternalScope(...)`.
 */

export interface ExternalGrantView {
  readonly grantId: string;
  readonly organizationId: string;
  readonly vendorId: string;
  /** null = every project of the vendor in this organization. */
  readonly projectId: string | null;
  /** null = every agreement of the vendor (within projectId when set). */
  readonly subcontractAgreementId: string | null;
  readonly capabilities: ReadonlySet<string>;
  readonly expiresAt: Date | null;
}

export interface ExternalContext {
  readonly principalId: string;
  readonly authUserId: string;
  readonly displayName: string | null;
  readonly locale: string;
  /** Active, unexpired, unrevoked contractor grants only. */
  readonly grants: readonly ExternalGrantView[];
  /** RLS-bound executor. Repositories must never open their own connection. */
  readonly db: DbExecutor;
}

export interface ExternalScopeTarget {
  readonly organizationId: string;
  readonly projectId?: string | null;
  readonly vendorId: string;
  readonly subcontractAgreementId?: string | null;
}

/** Pure mirror of SQL `app.external_has_scope`. */
export function externalGrantCovers(
  grant: ExternalGrantView,
  target: ExternalScopeTarget,
  capability: ExternalCapability,
  now: Date = new Date(),
): boolean {
  if (grant.organizationId !== target.organizationId) return false;
  if (grant.vendorId !== target.vendorId) return false;
  if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false;
  if (!grant.capabilities.has(capability)) return false;
  if (grant.projectId && grant.projectId !== (target.projectId ?? null)) return false;
  if (
    grant.subcontractAgreementId &&
    grant.subcontractAgreementId !== (target.subcontractAgreementId ?? null)
  ) {
    return false;
  }
  return true;
}

/** Returns the covering grant or throws AuthorizationError. No existence oracle: callers map to NotFound where needed. */
export function requireExternalScope(
  context: ExternalContext,
  target: ExternalScopeTarget,
  capability: ExternalCapability,
): ExternalGrantView {
  const grant = context.grants.find((candidate) => externalGrantCovers(candidate, target, capability));
  if (!grant) throw new AuthorizationError(`external:${capability}`);
  return grant;
}

export function hasExternalScope(
  context: ExternalContext,
  target: ExternalScopeTarget,
  capability: ExternalCapability,
): boolean {
  return context.grants.some((candidate) => externalGrantCovers(candidate, target, capability));
}

/** Vendor ids the principal can act for in an organization (for list scoping). */
export function externalVendorIds(context: ExternalContext, organizationId: string): readonly string[] {
  return [
    ...new Set(
      context.grants.filter((grant) => grant.organizationId === organizationId).map((grant) => grant.vendorId),
    ),
  ];
}
