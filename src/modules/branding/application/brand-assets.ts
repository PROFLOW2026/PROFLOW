import 'server-only';

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import {
  DomainRuleError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';
import { assertBrandAssetConstraints } from '../domain/logo-rules';
import type { BrandAssetKind } from '../domain/types';
import { findBrandProfileById, updateBrandProfile } from '../data/brand-profile.repository';
import {
  confirmBrandAssetUploadSchema,
  prepareBrandAssetUploadSchema,
  removeBrandAssetSchema,
  type ConfirmBrandAssetUploadInput,
  type PrepareBrandAssetUploadInput,
  type RemoveBrandAssetInput,
} from '../validation/schemas';

function assertOrgOwnedBrandingKey(
  organizationId: string,
  brandProfileId: string,
  storageKey: string,
): void {
  const prefix = `${organizationId}/branding/${brandProfileId}/`;
  if (!storageKey.startsWith(prefix) || storageKey.includes('..')) {
    throw new DomainRuleError(
      'Invalid branding storage key',
      'branding.errors.invalidStorageKey',
      { storageKey },
    );
  }
}

function patchForKind(
  kind: BrandAssetKind,
  input: {
    storageKey: string | null;
    mimeType: string | null;
    sizeBytes?: number | null;
    width?: number | null;
    height?: number | null;
  },
) {
  switch (kind) {
    case 'logo_primary':
      return {
        logoPrimaryKey: input.storageKey,
        logoPrimaryContentType: input.mimeType,
        logoPrimaryByteSize: input.sizeBytes ?? null,
        logoPrimaryWidth: input.width ?? null,
        logoPrimaryHeight: input.height ?? null,
      };
    case 'logo_compact':
      return {
        logoCompactKey: input.storageKey,
        logoCompactContentType: input.mimeType,
      };
    case 'logo_dark':
      return {
        logoDarkKey: input.storageKey,
        logoDarkContentType: input.mimeType,
      };
    case 'logo_light':
      return {
        logoLightKey: input.storageKey,
        logoLightContentType: input.mimeType,
      };
    case 'signature':
      return {
        signatureImageKey: input.storageKey,
        signatureImageContentType: input.mimeType,
      };
    case 'stamp':
      return {
        stampImageKey: input.storageKey,
        stampImageContentType: input.mimeType,
      };
  }
}

function previousKey(kind: BrandAssetKind, profile: Awaited<ReturnType<typeof findBrandProfileById>>) {
  if (!profile) return null;
  switch (kind) {
    case 'logo_primary':
      return profile.logoPrimaryKey;
    case 'logo_compact':
      return profile.logoCompactKey;
    case 'logo_dark':
      return profile.logoDarkKey;
    case 'logo_light':
      return profile.logoLightKey;
    case 'signature':
      return profile.signatureImageKey;
    case 'stamp':
      return profile.stampImageKey;
  }
}

function auditActionForKind(kind: BrandAssetKind) {
  if (kind === 'signature') return AUDIT_ACTIONS.BRAND_SIGNATURE_CHANGED;
  if (kind === 'stamp') return AUDIT_ACTIONS.BRAND_STAMP_CHANGED;
  return AUDIT_ACTIONS.BRAND_LOGO_CHANGED;
}

export async function prepareBrandAssetUpload(
  context: OrgContext,
  raw: PrepareBrandAssetUploadInput,
) {
  assertPermission(context, PERMISSIONS.ORG_UPDATE);
  const parsed = prepareBrandAssetUploadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const { mimeType } = assertBrandAssetConstraints({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width,
    height: input.height,
    fileName: input.fileName,
  });

  const profile = await findBrandProfileById(
    context.db,
    context.organizationId,
    input.brandProfileId,
  );
  if (!profile || profile.status !== 'active') throw new NotFoundError('Brand profile');

  const storage = getStoragePort();
  if (!storage.configured) {
    throw new ServiceUnavailableError(
      'File storage is not configured',
      'branding.errors.storageNotConfigured',
    );
  }

  const storageKey = storage.buildKey({
    organizationId: context.organizationId,
    entityType: 'branding',
    entityId: input.brandProfileId,
    fileName: input.fileName,
  });
  assertOrgOwnedBrandingKey(context.organizationId, input.brandProfileId, storageKey);

  try {
    const upload = await storage.createUploadUrl(storageKey, mimeType);
    return {
      storageKey,
      mimeType,
      uploadUrl: upload.url,
      token: upload.token,
      path: upload.path,
      expiresAt: upload.expiresAt,
    };
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      throw new ServiceUnavailableError(
        'File storage is not configured',
        'branding.errors.storageNotConfigured',
      );
    }
    throw error;
  }
}

export async function confirmBrandAssetUpload(
  context: OrgContext,
  raw: ConfirmBrandAssetUploadInput,
) {
  assertPermission(context, PERMISSIONS.ORG_UPDATE);
  const parsed = confirmBrandAssetUploadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const { mimeType } = assertBrandAssetConstraints({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width,
    height: input.height,
  });
  assertOrgOwnedBrandingKey(context.organizationId, input.brandProfileId, input.storageKey);

  const before = await findBrandProfileById(
    context.db,
    context.organizationId,
    input.brandProfileId,
  );
  if (!before || before.status !== 'active') throw new NotFoundError('Brand profile');

  // Immutable versioned keys: buildKey embeds a UUID. Never delete previous
  // objects — historical document_brand_snapshots keep pointing at old keys.
  const after = await updateBrandProfile(
    context.db,
    context.organizationId,
    input.brandProfileId,
    patchForKind(input.kind as BrandAssetKind, {
      storageKey: input.storageKey,
      mimeType,
      sizeBytes: input.sizeBytes,
      width: input.width,
      height: input.height,
    }),
  );

  await recordAuditEvent(context, {
    action: auditActionForKind(input.kind as BrandAssetKind),
    entityType: 'organization_brand_profile',
    entityId: input.brandProfileId,
    before,
    after,
  });

  return after;
}

export async function removeBrandAsset(context: OrgContext, raw: RemoveBrandAssetInput) {
  assertPermission(context, PERMISSIONS.ORG_UPDATE);
  const parsed = removeBrandAssetSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const before = await findBrandProfileById(
    context.db,
    context.organizationId,
    input.brandProfileId,
  );
  if (!before || before.status !== 'active') throw new NotFoundError('Brand profile');

  const oldKey = previousKey(input.kind as BrandAssetKind, before);
  const after = await updateBrandProfile(
    context.db,
    context.organizationId,
    input.brandProfileId,
    patchForKind(input.kind as BrandAssetKind, {
      storageKey: null,
      mimeType: null,
      sizeBytes: null,
      width: null,
      height: null,
    }),
  );

  // Keep storage objects for historical snapshots; only clear live profile pointer.
  void oldKey;

  await recordAuditEvent(context, {
    action: auditActionForKind(input.kind as BrandAssetKind),
    entityType: 'organization_brand_profile',
    entityId: input.brandProfileId,
    before,
    after,
  });

  return after;
}

/** Short-lived signed URL for settings preview / app shell mark. */
export async function getBrandAssetDownloadUrl(
  context: OrgContext,
  storageKey: string,
  expiresInSeconds = 300,
) {
  assertPermission(context, PERMISSIONS.ORG_READ);
  const prefix = `${context.organizationId}/branding/`;
  if (!storageKey.startsWith(prefix) || storageKey.includes('..') || storageKey.includes('\\')) {
    throw new DomainRuleError('Invalid branding storage key', 'branding.errors.invalidStorageKey');
  }
  const storage = getStoragePort();
  if (!storage.configured) return null;
  const signed = await storage.createDownloadUrl(storageKey, expiresInSeconds);
  return signed;
}
