/**
 * Public API — organization branding / document letterhead (not UI theme).
 * Portal stays OFF. Logo storage uses entityType `branding`.
 */

export type {
  BrandAssetKind,
  BrandProfile,
  BrandProfileStatus,
  BrandSnapshot,
  BrandSnapshotEntityType,
  CompanyProfile,
  DocumentBrandSnapshotRecord,
  DocumentTheme,
  ExtraIdentifier,
  FooterStyle,
  HeaderLayout,
  TemplatePreset,
} from './domain/types';

export { DEFAULT_PRIMARY_COLOR, DEFAULT_SECONDARY_COLOR } from './domain/types';

export {
  assertVisibleBrandColor,
  contrastTextOnBrand,
  isValidBrandHex,
  normalizeBrandHex,
  parseBrandHex,
} from './domain/colors';

export {
  assertBrandAssetConstraints,
  BRAND_ASSET_KINDS,
  isBrandAssetKind,
  MAX_BRAND_ASSET_BYTES,
  MAX_BRAND_ASSET_DIMENSION,
  normalizeBrandAssetMime,
} from './domain/logo-rules';

export { sanitizeBrandPlainText, sanitizeOptionalBrandText } from './domain/sanitize-text';

export {
  buildAddressLines,
  buildBrandSnapshot,
  buildEmailList,
  buildPhoneList,
  resolveAndBuildSnapshot,
  resolveBrandSelection,
} from './domain/resolve-brand';

export {
  documentBrandFromSnapshot,
  minimalBrandContext,
  type BrandColor,
  type DocumentBrandContext,
} from './domain/document-brand';

export { wrapCommunicationHtmlWithBrand } from './application/wrap-email-brand';

export {
  getCompanyProfile,
  getCompanyProfileForOrg,
  updateCompanyProfile,
  updateOrganizationCompanyProfile,
  updateCompanyProfile as upsertCompanyProfile,
} from './application/manage-company-profile';

export {
  archiveBrandProfile,
  getDefaultBrandProfile,
  listOrganizationBrandProfiles,
  listOrganizationBrandProfiles as listBrandProfiles,
  listOrganizationBrandProfiles as listOrgBrandProfiles,
  setDefaultBrandProfile,
  upsertOrganizationBrandProfile,
  upsertOrganizationBrandProfile as createBrandProfile,
  upsertOrganizationBrandProfile as updateBrandProfile,
} from './application/manage-brand-profile';

export {
  confirmBrandAssetUpload,
  getBrandAssetDownloadUrl,
  getBrandAssetDownloadUrl as resolveBrandAssetSignedUrl,
  prepareBrandAssetUpload,
  removeBrandAsset,
  confirmBrandAssetUpload as replaceBrandAsset,
} from './application/brand-assets';

export { ensureDefaultBranding } from './application/ensure-default-branding';
export type {
  EnsureDefaultBrandingResult,
  EnsureDefaultBrandingSeed,
} from './application/ensure-default-branding';

export {
  buildLiveBrandSnapshot,
  captureBrandSnapshot,
} from './application/capture-brand-snapshot';

export {
  resolveDocumentBrand,
  type ResolveDocumentBrandResult,
} from './application/resolve-document-brand';

export {
  brandProfileIdSchema,
  captureBrandSnapshotSchema,
  confirmBrandAssetSchema,
  confirmBrandAssetUploadSchema,
  createBrandProfileSchema,
  prepareBrandAssetSchema,
  prepareBrandAssetUploadSchema,
  removeBrandAssetSchema,
  resolveDocumentBrandSchema,
  updateBrandProfileSchema,
  updateCompanyProfileSchema,
  upsertBrandProfileSchema,
  type CaptureBrandSnapshotInput,
  type ConfirmBrandAssetInput,
  type ConfirmBrandAssetUploadInput,
  type CreateBrandProfileInput,
  type PrepareBrandAssetInput,
  type PrepareBrandAssetUploadInput,
  type RemoveBrandAssetInput,
  type ResolveDocumentBrandInput,
  type UpdateBrandProfileInput,
  type UpdateCompanyProfileInput,
  type UpsertBrandProfileInput,
} from './validation/schemas';

import type { OrgContext } from '@/shared/auth/context';
import { getBrandAssetDownloadUrl as fetchBrandAssetDownloadUrl } from './application/brand-assets';
import { findDefaultBrandProfile } from './data/brand-profile.repository';

/** Compact/default logo signed URL for app shell (document branding ≠ UI theme). */
export async function getShellOrgLogoUrl(context: OrgContext): Promise<string | null> {
  try {
    // Read-only: shell chrome must never seed branding (RLS insert race on first sign-in).
    const brand = await findDefaultBrandProfile(context.db, context.organizationId);
    const key = brand?.logoCompactKey ?? brand?.logoPrimaryKey ?? null;
    if (!key) return null;
    const signed = await fetchBrandAssetDownloadUrl(context, key, 600);
    return signed?.url ?? null;
  } catch {
    return null;
  }
}
