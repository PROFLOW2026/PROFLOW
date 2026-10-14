import 'server-only';

import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import {
  DomainRuleError,
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';
import { assertBrandAssetConstraints } from '@/modules/branding/domain/logo-rules';
import { assertCanAccessProject } from './project-access';
import { findProjectById, updateProjectCoverById } from '../data/projects.repository';
import { isProjectCoverImageSchemaReady } from '../data/project-cover-image-schema';
import {
  confirmProjectCoverUploadSchema,
  prepareProjectCoverUploadSchema,
  removeProjectCoverSchema,
  type ConfirmProjectCoverUploadInput,
  type PrepareProjectCoverUploadInput,
  type RemoveProjectCoverInput,
} from '../validation/project-cover-image-schemas';

function assertOrgOwnedProjectCoverKey(organizationId: string, projectId: string, storageKey: string): void {
  const prefix = `${organizationId}/project_cover/${projectId}/`;
  if (!storageKey.startsWith(prefix) || storageKey.includes('..') || storageKey.includes('\\')) {
    throw new DomainRuleError(
      'Invalid project cover storage key',
      'projects.cover.errors.invalidStorageKey',
      { storageKey },
    );
  }
}

async function assertCoverSchemaReady(context: OrgContext): Promise<void> {
  if (!(await isProjectCoverImageSchemaReady(context.db))) {
    throw new ServiceUnavailableError(
      'Project cover image is not available until database migration 0191 is applied',
      'projects.cover.schemaPending',
    );
  }
}

export async function getProjectCoverImageAvailability(
  context: OrgContext,
): Promise<{ schemaReady: boolean; storageConfigured: boolean }> {
  const schemaReady = await isProjectCoverImageSchemaReady(context.db);
  const storage = getStoragePort();
  return { schemaReady, storageConfigured: storage.configured };
}

export async function prepareProjectCoverUpload(
  context: OrgContext,
  raw: PrepareProjectCoverUploadInput,
) {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  await assertCoverSchemaReady(context);

  const parsed = prepareProjectCoverUploadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  await assertCanAccessProject(context, input.projectId);

  const project = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!project) throw new NotFoundError('Project');
  assertSameOrganization(context, project, 'Project');

  const { mimeType } = assertBrandAssetConstraints({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width,
    height: input.height,
    fileName: input.fileName,
  });

  const storage = getStoragePort();
  if (!storage.configured) {
    throw new ServiceUnavailableError(
      'File storage is not configured',
      'projects.cover.storageNotConfigured',
    );
  }

  const storageKey = storage.buildKey({
    organizationId: context.organizationId,
    entityType: 'project_cover',
    entityId: input.projectId,
    fileName: input.fileName,
  });
  assertOrgOwnedProjectCoverKey(context.organizationId, input.projectId, storageKey);

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
        'projects.cover.storageNotConfigured',
      );
    }
    throw error;
  }
}

export async function confirmProjectCoverUpload(
  context: OrgContext,
  raw: ConfirmProjectCoverUploadInput,
) {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  await assertCoverSchemaReady(context);

  const parsed = confirmProjectCoverUploadSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  await assertCanAccessProject(context, input.projectId);
  assertOrgOwnedProjectCoverKey(context.organizationId, input.projectId, input.storageKey);

  const { mimeType } = assertBrandAssetConstraints({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    width: input.width,
    height: input.height,
  });

  const before = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!before) throw new NotFoundError('Project');
  assertSameOrganization(context, before, 'Project');

  const after = await updateProjectCoverById(
    context.db,
    context.organizationId,
    input.projectId,
    {
      coverImageKey: input.storageKey,
      coverImageContentType: mimeType,
      coverImageWidth: input.width ?? null,
      coverImageHeight: input.height ?? null,
      coverImageUpdatedAt: new Date(),
      coverImageUpdatedByUserId: context.userId,
    },
  );
  if (!after) throw new NotFoundError('Project');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_COVER_CHANGED,
    entityType: 'project',
    entityId: input.projectId,
    before,
    after,
  });

  return after;
}

export async function removeProjectCover(context: OrgContext, raw: RemoveProjectCoverInput) {
  assertPermission(context, PERMISSIONS.PROJECTS_UPDATE);
  await assertCoverSchemaReady(context);

  const parsed = removeProjectCoverSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  await assertCanAccessProject(context, input.projectId);

  const before = await findProjectById(context.db, context.organizationId, input.projectId);
  if (!before) throw new NotFoundError('Project');
  assertSameOrganization(context, before, 'Project');

  const oldKey = before.coverImageKey;
  const after = await updateProjectCoverById(
    context.db,
    context.organizationId,
    input.projectId,
    {
      coverImageKey: null,
      coverImageContentType: null,
      coverImageWidth: null,
      coverImageHeight: null,
      coverImageUpdatedAt: new Date(),
      coverImageUpdatedByUserId: context.userId,
    },
  );
  if (!after) throw new NotFoundError('Project');

  void oldKey;

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.PROJECT_COVER_REMOVED,
    entityType: 'project',
    entityId: input.projectId,
    before,
    after,
  });

  return after;
}

/** Short-lived signed URL for header/list `<img>` preview (inline, not download). */
export async function getProjectCoverViewUrl(
  context: OrgContext,
  storageKey: string,
  expiresInSeconds = 300,
): Promise<string | null> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  const prefix = `${context.organizationId}/project_cover/`;
  if (!storageKey.startsWith(prefix) || storageKey.includes('..') || storageKey.includes('\\')) {
    throw new DomainRuleError(
      'Invalid project cover storage key',
      'projects.cover.errors.invalidStorageKey',
    );
  }
  const storage = getStoragePort();
  if (!storage.configured) return null;
  const signed = await storage.createDownloadUrl(storageKey, expiresInSeconds);
  return signed.url;
}

export async function getProjectCoverDisplayUrl(
  context: OrgContext,
  projectId: string,
): Promise<string | null> {
  await assertCanAccessProject(context, projectId);
  const project = await findProjectById(context.db, context.organizationId, projectId);
  if (!project?.coverImageKey) return null;
  return getProjectCoverViewUrl(context, project.coverImageKey);
}

export async function resolveProjectCoverViewUrls(
  context: OrgContext,
  items: readonly { projectId: string; storageKey: string | null }[],
): Promise<Record<string, string | null>> {
  assertPermission(context, PERMISSIONS.PROJECTS_READ);
  const out: Record<string, string | null> = {};
  await Promise.all(
    items.map(async (item) => {
      if (!item.storageKey) {
        out[item.projectId] = null;
        return;
      }
      try {
        out[item.projectId] = await getProjectCoverViewUrl(context, item.storageKey);
      } catch {
        out[item.projectId] = null;
      }
    }),
  );
  return out;
}
