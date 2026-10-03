import { sql } from 'drizzle-orm';
import { AuthorizationError } from '@/shared/errors';
import {
  EXTERNAL_CAPABILITIES,
  type ExternalCapability,
  type ExternalContext,
} from '@/shared/external';

/** One (organization, vendor, agreement?) party the principal may act as on a project. */
export interface ExternalProjectTarget {
  readonly organizationId: string;
  readonly projectId: string;
  readonly vendorId: string;
  /** Set when the grant is narrowed to one agreement; null = vendor-wide on the project. */
  readonly subcontractAgreementId: string | null;
}

function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? (rows as T[]) : [];
}

/**
 * Grants of the principal that cover `capability` on `projectId`. Vendor-wide grants (no project)
 * are confirmed against the database (`app.external_can_see_project`) so a project of another
 * organization or vendor can never be targeted.
 */
export async function resolveExternalProjectTargets(
  context: ExternalContext,
  projectId: string,
  capability: ExternalCapability,
): Promise<ExternalProjectTarget[]> {
  const candidates = context.grants.filter(
    (grant) =>
      grant.capabilities.has(capability) &&
      grant.capabilities.has(EXTERNAL_CAPABILITIES.PROJECT_VIEW) &&
      (grant.projectId === null || grant.projectId === projectId) &&
      (grant.expiresAt === null || grant.expiresAt.getTime() > Date.now()),
  );
  if (candidates.length === 0) return [];

  const visibleOrgs = new Map<string, boolean>();
  for (const organizationId of new Set(candidates.map((grant) => grant.organizationId))) {
    const result = await context.db.execute(
      sql`select app.external_can_see_project(${organizationId}::uuid, ${projectId}::uuid) as visible`,
    );
    visibleOrgs.set(organizationId, rowsOf<{ visible: boolean }>(result)[0]?.visible === true);
  }

  const seen = new Set<string>();
  const targets: ExternalProjectTarget[] = [];
  for (const grant of candidates) {
    if (!visibleOrgs.get(grant.organizationId)) continue;
    const key = `${grant.organizationId}:${grant.vendorId}:${grant.subcontractAgreementId ?? ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    targets.push({
      organizationId: grant.organizationId,
      projectId,
      vendorId: grant.vendorId,
      subcontractAgreementId: grant.subcontractAgreementId,
    });
  }
  return targets;
}

/** Picks the target the caller asked for (vendor + optional agreement) or the only one available. */
export function pickExternalTarget(
  targets: readonly ExternalProjectTarget[],
  requested: { readonly vendorId?: string | null; readonly subcontractAgreementId?: string | null },
): ExternalProjectTarget {
  const matches = targets.filter(
    (target) =>
      (!requested.vendorId || target.vendorId === requested.vendorId) &&
      (requested.subcontractAgreementId === undefined ||
        requested.subcontractAgreementId === null ||
        target.subcontractAgreementId === null ||
        target.subcontractAgreementId === requested.subcontractAgreementId),
  );
  if (matches.length === 0) throw new AuthorizationError('external:no-project-scope');
  const exact = matches.find(
    (target) => target.subcontractAgreementId === (requested.subcontractAgreementId ?? null),
  );
  return exact ?? matches[0]!;
}
