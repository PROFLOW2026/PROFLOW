import type { DbExecutor } from '@/shared/db/types';
import type { PermissionKey } from '@/shared/permissions/catalog';

/**
 * Request context (doc 71 §4).
 *
 * An `OrgContext` can only be produced by the server after it has validated the
 * session, resolved the active organization and confirmed an active membership.
 * Use cases take it as their first argument, which is what makes "did anyone
 * check the tenant?" answerable by reading a signature.
 */

export interface AuthenticatedUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string | null;
  readonly localePreference: string | null;
}

export interface OrganizationSummary {
  readonly id: string;
  readonly name: string;
  readonly baseCurrency: string;
  readonly timezone: string;
  readonly countryCode: string;
  readonly defaultLocale: string;
  /** 0=Sunday … 6=Saturday. Default 0 when omitted (historic Sunday-start). */
  readonly workWeekStartDay?: number;
}

export interface OrgContext {
  readonly userId: string;
  readonly organizationId: string;
  readonly membershipId: string;
  readonly organization: OrganizationSummary;
  /** Union of every permission granted by the user's roles in this organization. */
  readonly permissions: ReadonlySet<PermissionKey>;
  readonly roleKeys: readonly string[];
  /** RLS-bound executor. Repositories must never open their own connection. */
  readonly db: DbExecutor;
  readonly locale: string;
}

/** Returns a copy bound to a different executor, used to run inside a transaction. */
export function withExecutor(context: OrgContext, db: DbExecutor): OrgContext {
  return { ...context, db };
}
