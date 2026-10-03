import { sql } from 'drizzle-orm';
import type { Database, DbExecutor } from '@/shared/db/types';
import type { ExternalContext, ExternalGrantView } from '@/shared/external';
import { isLocale } from '@/shared/i18n/config';
import { createRlsBoundExecutor } from '../data/rls-executor';
import {
  findContractorPrincipalByAuthUser,
  listLiveGrantsForPrincipal,
  type ContractorGrantRow,
} from '../data/contractor-access.repository';

/**
 * Session -> ExternalContext. Pure of Next.js: the caller supplies the verified auth user id (from
 * `supabase.auth.getUser()`) and the instant the session was authenticated.
 *
 * Every read below goes through the RLS-bound executor, i.e. the principal only ever sees its own
 * principal row and its own grants (policies `external_principals_self_select`,
 * `external_access_grants_principal_select` in 0156).
 */

const SESSION_CLOCK_TOLERANCE_MS = 2_000;

export type ExternalSessionRejection = 'not_contractor' | 'inactive' | 'session_revoked';

export type LoadExternalContextResult =
  | { readonly ok: true; readonly context: ExternalContext }
  | { readonly ok: false; readonly reason: ExternalSessionRejection };

export interface LoadExternalContextInput {
  readonly authUserId: string;
  /** Sign-in instant of the presented session (JWT `amr` timestamp / `iat`); null = unknown. */
  readonly sessionAuthenticatedAt: Date | null;
  readonly fallbackLocale: string;
  readonly now?: Date;
}

export function grantRowToView(row: ContractorGrantRow): ExternalGrantView | null {
  if (!row.vendorId) return null;
  return {
    grantId: row.id,
    organizationId: row.organizationId,
    vendorId: row.vendorId,
    projectId: row.projectId,
    subcontractAgreementId: row.subcontractAgreementId,
    capabilities: new Set(row.scopes),
    expiresAt: row.expiresAt,
  };
}

export async function loadExternalContext(
  base: Database,
  input: LoadExternalContextInput,
): Promise<LoadExternalContextResult> {
  const now = input.now ?? new Date();
  const db: DbExecutor = createRlsBoundExecutor(base, input.authUserId);

  const principal = await findContractorPrincipalByAuthUser(db, input.authUserId);
  if (!principal) return { ok: false, reason: 'not_contractor' };
  if (principal.status !== 'active' || principal.archivedAt) return { ok: false, reason: 'inactive' };
  if (principal.sessionsRevokedAt) {
    const authenticatedAt = input.sessionAuthenticatedAt;
    // Unknown session age is treated as stale once a revocation happened. The tolerance covers the
    // whole-second JWT timestamps of the sign-in that immediately follows a reset / password change.
    if (
      !authenticatedAt ||
      authenticatedAt.getTime() + SESSION_CLOCK_TOLERANCE_MS <= principal.sessionsRevokedAt.getTime()
    ) {
      return { ok: false, reason: 'session_revoked' };
    }
  }

  const rows = await listLiveGrantsForPrincipal(db, principal.id, now);
  const grants = rows.map(grantRowToView).filter((grant): grant is ExternalGrantView => grant !== null);

  return {
    ok: true,
    context: {
      principalId: principal.id,
      authUserId: input.authUserId,
      displayName: principal.displayName,
      locale: principal.locale && isLocale(principal.locale) ? principal.locale : input.fallbackLocale,
      grants,
      db,
    },
  };
}

export interface ExternalDirectoryEntry {
  readonly grantId: string;
  readonly organizationId: string;
  readonly organizationName: string;
  readonly vendorId: string;
  readonly vendorName: string;
  readonly projectId: string | null;
  readonly projectName: string | null;
  readonly subcontractAgreementId: string | null;
  readonly agreementTitle: string | null;
}

/**
 * Safe names (organization / vendor / project / agreement) for the principal's live grants - no money,
 * no settings. Backed by the SECURITY DEFINER `app.external_portal_directory()`; one row per
 * (grant, reachable agreement), and a row with null agreement for project-scoped grants without one.
 */
export async function listExternalDirectory(context: ExternalContext): Promise<ExternalDirectoryEntry[]> {
  const result = await context.db.execute(sql`select * from app.external_portal_directory()`);
  const rows = (Array.isArray(result) ? result : (result as { rows: unknown[] }).rows) as Array<{
    grant_id: string;
    organization_id: string;
    organization_name: string;
    vendor_id: string;
    vendor_name: string;
    project_id: string | null;
    project_name: string | null;
    subcontract_agreement_id: string | null;
    agreement_title: string | null;
  }>;
  return rows.map((row) => ({
    grantId: row.grant_id,
    organizationId: row.organization_id,
    organizationName: row.organization_name,
    vendorId: row.vendor_id,
    vendorName: row.vendor_name,
    projectId: row.project_id,
    projectName: row.project_name,
    subcontractAgreementId: row.subcontract_agreement_id,
    agreementTitle: row.agreement_title,
  }));
}
