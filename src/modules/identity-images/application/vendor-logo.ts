import 'server-only';

import { and, eq } from 'drizzle-orm';
import { vendors } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { NotFoundError, ServiceUnavailableError, ValidationError } from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';
import { z } from 'zod';
import { isIdentityImagesSchemaReady } from '../data/identity-images-schema';
import { assertIdentityImageConstraints, assertOrgOwnedIdentityKey } from '../domain/image-rules';
import { resolveIdentityImageUrl } from './resolve-identity-image-urls';

const prepareSchema = z.object({
  vendorId: z.string().uuid(),
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const confirmSchema = z.object({
  vendorId: z.string().uuid(),
  storageKey: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});

const removeSchema = z.object({
  vendorId: z.string().uuid(),
});

async function assertSchemaReady(context: OrgContext): Promise<void> {
  if (!(await isIdentityImagesSchemaReady(context.db))) {
    throw new ServiceUnavailableError(
      'Vendor logos are not available until database migration 0193 is applied',
      'identityImages.schemaPending',
    );
  }
}

async function loadVendor(context: OrgContext, vendorId: string) {
  const [row] = await context.db
    .select({
      id: vendors.id,
      organizationId: vendors.organizationId,
      name: vendors.name,
      logoImageKey: vendors.logoImageKey,
    })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.organizationId, context.organizationId)))
    .limit(1);
  return row ?? null;
}

export async function getVendorLogoAvailability(context: OrgContext) {
  const schemaReady = await isIdentityImagesSchemaReady(context.db);
  const storage = getStoragePort();
  return { schemaReady, storageConfigured: storage.configured };
}

export async function getVendorLogoPreviewUrl(
  context: OrgContext,
  vendorId: string,
): Promise<string | null> {
  if (!(await isIdentityImagesSchemaReady(context.db))) return null;
  const vendor = await loadVendor(context, vendorId);
  if (!vendor) return null;
  return resolveIdentityImageUrl(vendor.logoImageKey);
}

export async function prepareVendorLogoUpload(context: OrgContext, raw: unknown) {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);
  await assertSchemaReady(context);
  const parsed = prepareSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const vendor = await loadVendor(context, input.vendorId);
  if (!vendor) throw new NotFoundError('Vendor');
  assertSameOrganization(context, vendor, 'Vendor');

  const { mimeType } = assertIdentityImageConstraints({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width,
    height: input.height,
    fileName: input.fileName,
  });

  const storage = getStoragePort();
  if (!storage.configured) {
    throw new ServiceUnavailableError('File storage is not configured', 'identityImages.storageNotConfigured');
  }

  const storageKey = storage.buildKey({
    organizationId: context.organizationId,
    entityType: 'vendor_logo',
    entityId: input.vendorId,
    fileName: input.fileName,
  });
  assertOrgOwnedIdentityKey(context.organizationId, 'vendor_logo', input.vendorId, storageKey);

  try {
    const upload = await storage.createUploadUrl(storageKey, mimeType);
    return {
      storageKey,
      uploadUrl: upload.url,
      uploadToken: upload.token,
      uploadPath: upload.path,
      mimeType,
    };
  } catch (error) {
    if (error instanceof StorageNotConfiguredError) {
      throw new ServiceUnavailableError('File storage is not configured', 'identityImages.storageNotConfigured');
    }
    throw error;
  }
}

export async function confirmVendorLogoUpload(context: OrgContext, raw: unknown) {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);
  await assertSchemaReady(context);
  const parsed = confirmSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const vendor = await loadVendor(context, input.vendorId);
  if (!vendor) throw new NotFoundError('Vendor');
  assertSameOrganization(context, vendor, 'Vendor');
  assertOrgOwnedIdentityKey(context.organizationId, 'vendor_logo', input.vendorId, input.storageKey);

  const { mimeType } = assertIdentityImageConstraints({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    fileName: input.storageKey.split('/').pop() ?? 'logo',
  });

  const previousKey = vendor.logoImageKey;
  await context.db
    .update(vendors)
    .set({
      logoImageKey: input.storageKey,
      logoImageContentType: mimeType,
      logoImageUpdatedAt: new Date(),
      logoImageUpdatedByUserId: context.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(vendors.id, input.vendorId), eq(vendors.organizationId, context.organizationId)));

  if (previousKey && previousKey !== input.storageKey) {
    const storage = getStoragePort();
    if (storage.configured) {
      try {
        await storage.remove(previousKey);
      } catch {
        // best-effort
      }
    }
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.VENDOR_UPDATED,
    entityType: 'vendor',
    entityId: input.vendorId,
    metadata: { logo: 'set' },
  });

  return { ok: true as const, previewUrl: await resolveIdentityImageUrl(input.storageKey) };
}

export async function mapVendorLogoKeys(
  db: OrgContext['db'],
  organizationId: string,
  vendorIds: readonly string[],
): Promise<Map<string, string | null>> {
  const { inArray } = await import('drizzle-orm');
  const out = new Map<string, string | null>();
  if (vendorIds.length === 0) return out;
  if (!(await isIdentityImagesSchemaReady(db))) {
    for (const id of vendorIds) out.set(id, null);
    return out;
  }
  const batch = await db
    .select({ id: vendors.id, logoImageKey: vendors.logoImageKey })
    .from(vendors)
    .where(and(eq(vendors.organizationId, organizationId), inArray(vendors.id, [...vendorIds])));
  for (const row of batch) out.set(row.id, row.logoImageKey ?? null);
  for (const id of vendorIds) if (!out.has(id)) out.set(id, null);
  return out;
}

export async function removeVendorLogo(context: OrgContext, raw: unknown) {
  assertPermission(context, PERMISSIONS.VENDORS_MANAGE);
  await assertSchemaReady(context);
  const parsed = removeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const vendor = await loadVendor(context, parsed.data.vendorId);
  if (!vendor) throw new NotFoundError('Vendor');
  assertSameOrganization(context, vendor, 'Vendor');

  const previousKey = vendor.logoImageKey;
  await context.db
    .update(vendors)
    .set({
      logoImageKey: null,
      logoImageContentType: null,
      logoImageUpdatedAt: new Date(),
      logoImageUpdatedByUserId: context.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(vendors.id, parsed.data.vendorId), eq(vendors.organizationId, context.organizationId)));

  if (previousKey) {
    const storage = getStoragePort();
    if (storage.configured) {
      try {
        await storage.remove(previousKey);
      } catch {
        // best-effort
      }
    }
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.VENDOR_UPDATED,
    entityType: 'vendor',
    entityId: parsed.data.vendorId,
    metadata: { logo: 'removed' },
  });

  return { ok: true as const };
}
