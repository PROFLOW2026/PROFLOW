import type { ExternalGrantView } from '@/shared/external/context';

export interface ExternalNotificationScope {
  readonly organizationId: string;
  readonly vendorId: string | null;
  readonly projectId: string | null;
  readonly subcontractAgreementId: string | null;
  readonly requiredCapabilities: readonly string[];
}

/**
 * A stored notification stays visible only while a CURRENT grant still covers its scope and one of
 * the capabilities the event required (revoking a grant or a capability hides it immediately).
 * Mirrors `externalGrantCovers` without a single fixed capability.
 */
export function externalNotificationVisible(
  grants: readonly ExternalGrantView[],
  scope: ExternalNotificationScope,
  now: Date = new Date(),
): boolean {
  return grants.some((grant) => {
    if (grant.organizationId !== scope.organizationId) return false;
    if (grant.expiresAt && grant.expiresAt.getTime() <= now.getTime()) return false;
    if (scope.vendorId && grant.vendorId !== scope.vendorId) return false;
    if (grant.projectId && grant.projectId !== scope.projectId) return false;
    if (grant.subcontractAgreementId && grant.subcontractAgreementId !== scope.subcontractAgreementId) {
      return false;
    }
    if (scope.requiredCapabilities.length === 0) return true;
    return scope.requiredCapabilities.some((capability) => grant.capabilities.has(capability));
  });
}
