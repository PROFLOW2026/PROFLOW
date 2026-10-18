import 'server-only';

import { eq } from 'drizzle-orm';
import { contractorPrincipals } from '@drizzle/schema';
import type { ExternalContext } from '@/shared/external';
import { NotFoundError, ServiceUnavailableError, ValidationError } from '@/shared/errors';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';
import { z } from 'zod';
import { isIdentityImagesSchemaReady } from '../data/identity-images-schema';
import { assertIdentityImageConstraints, assertOrgOwnedIdentityKey } from '../domain/image-rules';
import { resolveIdentityImageUrl } from './resolve-identity-image-urls';

const prepareSchema = z.object({
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const confirmSchema = z.object({
  storageKey: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});

/** Storage key tenancy prefix — first active grant organization. */
function storageOrgId(context: ExternalContext): string {
  const first = context.grants[0]?.organizationId;
  if (first) return first;
  throw new ServiceUnavailableError(
    'Contractor has no organization for avatar storage',
    'identityImages.noOrganization',
  );
}

async function assertSchemaReady(context: ExternalContext): Promise<void> {
  if (!(await isIdentityImagesSchemaReady(context.db))) {
    throw new ServiceUnavailableError(
      'Profile images are not available until database migration 0193 is applied',
      'identityImages.schemaPending',
    );
  }
}

export async function getContractorAvatarAvailability(context: ExternalContext) {
  const schemaReady = await isIdentityImagesSchemaReady(context.db);
  const storage = getStoragePort();
  return { schemaReady, storageConfigured: storage.configured };
}

export async function getContractorAvatarPreviewUrl(context: ExternalContext): Promise<string | null> {
  if (!(await isIdentityImagesSchemaReady(context.db))) return null;
  const [row] = await context.db
    .select({ avatarImageKey: contractorPrincipals.avatarImageKey })
    .from(contractorPrincipals)
    .where(eq(contractorPrincipals.id, context.principalId))
    .limit(1);
  return resolveIdentityImageUrl(row?.avatarImageKey);
}

export async function prepareContractorAvatarUpload(context: ExternalContext, raw: unknown) {
  await assertSchemaReady(context);
  const parsed = prepareSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const { mimeType } = assertIdentityImageConstraints({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width,
    height: input.height,
    fileName: input.fileName,
  });
  const organizationId = storageOrgId(context);
  const storage = getStoragePort();
  if (!storage.configured) {
    throw new ServiceUnavailableError('File storage is not configured', 'identityImages.storageNotConfigured');
  }
  const storageKey = storage.buildKey({
    organizationId,
    entityType: 'contractor_avatar',
    entityId: context.principalId,
    fileName: input.fileName,
  });
  assertOrgOwnedIdentityKey(organizationId, 'contractor_avatar', context.principalId, storageKey);
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

export async function confirmContractorAvatarUpload(context: ExternalContext, raw: unknown) {
  await assertSchemaReady(context);
  const parsed = confirmSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const organizationId = storageOrgId(context);
  assertOrgOwnedIdentityKey(organizationId, 'contractor_avatar', context.principalId, input.storageKey);
  const { mimeType } = assertIdentityImageConstraints({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    fileName: input.storageKey.split('/').pop() ?? 'avatar',
  });

  const [before] = await context.db
    .select({ avatarImageKey: contractorPrincipals.avatarImageKey })
    .from(contractorPrincipals)
    .where(eq(contractorPrincipals.id, context.principalId))
    .limit(1);
  if (!before) throw new NotFoundError('Contractor');

  await context.db
    .update(contractorPrincipals)
    .set({
      avatarImageKey: input.storageKey,
      avatarImageContentType: mimeType,
      avatarImageUpdatedAt: new Date(),
      avatarImageUpdatedByUserId: context.authUserId,
      updatedAt: new Date(),
    })
    .where(eq(contractorPrincipals.id, context.principalId));

  if (before.avatarImageKey && before.avatarImageKey !== input.storageKey) {
    const storage = getStoragePort();
    if (storage.configured) {
      try {
        await storage.remove(before.avatarImageKey);
      } catch {
        // best-effort
      }
    }
  }

  return { ok: true as const, previewUrl: await resolveIdentityImageUrl(input.storageKey) };
}

export async function removeContractorAvatar(context: ExternalContext) {
  await assertSchemaReady(context);
  const [before] = await context.db
    .select({ avatarImageKey: contractorPrincipals.avatarImageKey })
    .from(contractorPrincipals)
    .where(eq(contractorPrincipals.id, context.principalId))
    .limit(1);
  if (!before) throw new NotFoundError('Contractor');

  await context.db
    .update(contractorPrincipals)
    .set({
      avatarImageKey: null,
      avatarImageContentType: null,
      avatarImageUpdatedAt: new Date(),
      avatarImageUpdatedByUserId: context.authUserId,
      updatedAt: new Date(),
    })
    .where(eq(contractorPrincipals.id, context.principalId));

  if (before.avatarImageKey) {
    const storage = getStoragePort();
    if (storage.configured) {
      try {
        await storage.remove(before.avatarImageKey);
      } catch {
        // best-effort
      }
    }
  }

  return { ok: true as const };
}
