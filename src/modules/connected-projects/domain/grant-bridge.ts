import type { ExternalGrantView } from '@/shared/external';
import type { ConnectedProjectMappingView } from './types';

const MAPPING_VISIBLE_STATUSES = new Set<ConnectedProjectMappingView['status']>([
  'accepted',
  'provisioning',
  'active',
  'sync_degraded',
]);

export function isConnectedMappingVisible(status: ConnectedProjectMappingView['status']): boolean {
  return MAPPING_VISIBLE_STATUSES.has(status);
}

/** Grants whose scope covers this connection. Org membership is never considered here. */
export function grantsCoveringConnectedMapping(
  grants: readonly ExternalGrantView[],
  mapping: Pick<
    ConnectedProjectMappingView,
    'developerOrganizationId' | 'developerProjectId' | 'subcontractAgreementId' | 'vendorId'
  >,
  now: Date = new Date(),
): readonly ExternalGrantView[] {
  return grants.filter((grant) => {
    if (grant.organizationId !== mapping.developerOrganizationId) return false;
    if (grant.vendorId !== mapping.vendorId) return false;
    if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false;
    if (grant.projectId && grant.projectId !== mapping.developerProjectId) return false;
    if (
      grant.subcontractAgreementId &&
      grant.subcontractAgreementId !== mapping.subcontractAgreementId
    ) {
      return false;
    }
    return true;
  });
}

/** Union of `ext.*` scopes from covering grants only (Owner correction B). */
export function connectedDeveloperCapabilities(
  grants: readonly ExternalGrantView[],
  mapping: Pick<
    ConnectedProjectMappingView,
    'developerOrganizationId' | 'developerProjectId' | 'subcontractAgreementId' | 'vendorId'
  >,
  now?: Date,
): ReadonlySet<string> {
  const covering = grantsCoveringConnectedMapping(grants, mapping, now);
  return new Set(covering.flatMap((grant) => [...grant.capabilities]));
}

export function pickPrimaryCoveringGrant(
  grants: readonly ExternalGrantView[],
  mapping: Pick<
    ConnectedProjectMappingView,
    'developerOrganizationId' | 'developerProjectId' | 'subcontractAgreementId' | 'vendorId'
  >,
  now?: Date,
): ExternalGrantView | null {
  const covering = grantsCoveringConnectedMapping(grants, mapping, now);
  if (covering.length === 0) return null;
  return (
    covering.find((grant) => grant.subcontractAgreementId === mapping.subcontractAgreementId) ??
    covering[0] ??
    null
  );
}
