import { DomainRuleError } from '@/shared/errors';
import { assertBrandAssetConstraints } from '@/modules/branding/domain/logo-rules';

/** Reuse branding image constraints (PNG/JPEG/WebP, size/dimension caps). */
export function assertIdentityImageConstraints(input: {
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
  fileName: string;
}): { mimeType: string } {
  try {
    return assertBrandAssetConstraints(input);
  } catch (error) {
    if (error instanceof DomainRuleError) throw error;
    throw error;
  }
}

export type IdentityImageKind = 'employee_avatar' | 'contractor_avatar' | 'vendor_logo';

export function assertOrgOwnedIdentityKey(
  organizationId: string,
  kind: IdentityImageKind,
  entityId: string,
  storageKey: string,
): void {
  const prefix = `${organizationId}/${kind}/${entityId}/`;
  if (!storageKey.startsWith(prefix) || storageKey.includes('..') || storageKey.includes('\\')) {
    throw new DomainRuleError('Invalid identity image storage key', 'identityImages.errors.invalidStorageKey', {
      storageKey,
    });
  }
}
