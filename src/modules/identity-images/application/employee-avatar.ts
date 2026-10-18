import 'server-only';

import { and, eq } from 'drizzle-orm';
import { employees } from '@drizzle/schema';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import {
  NotFoundError,
  ServiceUnavailableError,
  ValidationError,
} from '@/shared/errors';
import { assertPermission, assertSameOrganization } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { getStoragePort, StorageNotConfiguredError } from '@/shared/ports/storage';
import { z } from 'zod';
import { isIdentityImagesSchemaReady } from '../data/identity-images-schema';
import { assertIdentityImageConstraints, assertOrgOwnedIdentityKey } from '../domain/image-rules';
import { resolveIdentityImageUrl } from './resolve-identity-image-urls';

const prepareSchema = z.object({
  employeeId: z.string().uuid(),
  fileName: z.string().min(1).max(240),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

const confirmSchema = z.object({
  employeeId: z.string().uuid(),
  storageKey: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().positive(),
});

const removeSchema = z.object({
  employeeId: z.string().uuid(),
});

async function assertSchemaReady(context: OrgContext): Promise<void> {
  if (!(await isIdentityImagesSchemaReady(context.db))) {
    throw new ServiceUnavailableError(
      'Employee avatars are not available until database migration 0193 is applied',
      'identityImages.schemaPending',
    );
  }
}

async function loadEmployee(context: OrgContext, employeeId: string) {
  const [row] = await context.db
    .select({
      id: employees.id,
      organizationId: employees.organizationId,
      name: employees.name,
      userId: employees.userId,
      avatarImageKey: employees.avatarImageKey,
    })
    .from(employees)
    .where(and(eq(employees.id, employeeId), eq(employees.organizationId, context.organizationId)))
    .limit(1);
  return row ?? null;
}

/** Managers or the linked login for that employee may update the avatar. */
function assertCanEditEmployeeAvatar(
  context: OrgContext,
  employee: { userId: string | null },
): void {
  if (employee.userId && employee.userId === context.userId) return;
  assertPermission(context, PERMISSIONS.WORKFORCE_MANAGE);
}

export async function getEmployeeAvatarAvailability(context: OrgContext) {
  const schemaReady = await isIdentityImagesSchemaReady(context.db);
  const storage = getStoragePort();
  return { schemaReady, storageConfigured: storage.configured };
}

export async function getEmployeeAvatarPreviewUrl(
  context: OrgContext,
  employeeId: string,
): Promise<string | null> {
  if (!(await isIdentityImagesSchemaReady(context.db))) return null;
  const employee = await loadEmployee(context, employeeId);
  if (!employee) return null;
  return resolveIdentityImageUrl(employee.avatarImageKey);
}

export async function prepareEmployeeAvatarUpload(context: OrgContext, raw: unknown) {
  await assertSchemaReady(context);
  const parsed = prepareSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const employee = await loadEmployee(context, input.employeeId);
  if (!employee) throw new NotFoundError('Employee');
  assertSameOrganization(context, employee, 'Employee');
  assertCanEditEmployeeAvatar(context, employee);

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
    entityType: 'employee_avatar',
    entityId: input.employeeId,
    fileName: input.fileName,
  });
  assertOrgOwnedIdentityKey(context.organizationId, 'employee_avatar', input.employeeId, storageKey);

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

export async function confirmEmployeeAvatarUpload(context: OrgContext, raw: unknown) {
  await assertSchemaReady(context);
  const parsed = confirmSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const input = parsed.data;
  const employee = await loadEmployee(context, input.employeeId);
  if (!employee) throw new NotFoundError('Employee');
  assertSameOrganization(context, employee, 'Employee');
  assertCanEditEmployeeAvatar(context, employee);
  assertOrgOwnedIdentityKey(context.organizationId, 'employee_avatar', input.employeeId, input.storageKey);

  const { mimeType } = assertIdentityImageConstraints({
    mimeType: input.mimeType,
    sizeBytes: input.sizeBytes,
    fileName: input.storageKey.split('/').pop() ?? 'avatar',
  });

  const previousKey = employee.avatarImageKey;
  await context.db
    .update(employees)
    .set({
      avatarImageKey: input.storageKey,
      avatarImageContentType: mimeType,
      avatarImageUpdatedAt: new Date(),
      avatarImageUpdatedByUserId: context.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(employees.id, input.employeeId), eq(employees.organizationId, context.organizationId)));

  if (previousKey && previousKey !== input.storageKey) {
    const storage = getStoragePort();
    if (storage.configured) {
      try {
        await storage.remove(previousKey);
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
    entityType: 'employee',
    entityId: input.employeeId,
    metadata: { avatar: 'set' },
  });

  return { ok: true as const, previewUrl: await resolveIdentityImageUrl(input.storageKey) };
}

export async function removeEmployeeAvatar(context: OrgContext, raw: unknown) {
  await assertSchemaReady(context);
  const parsed = removeSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const employee = await loadEmployee(context, parsed.data.employeeId);
  if (!employee) throw new NotFoundError('Employee');
  assertSameOrganization(context, employee, 'Employee');
  assertCanEditEmployeeAvatar(context, employee);

  const previousKey = employee.avatarImageKey;
  await context.db
    .update(employees)
    .set({
      avatarImageKey: null,
      avatarImageContentType: null,
      avatarImageUpdatedAt: new Date(),
      avatarImageUpdatedByUserId: context.userId,
      updatedAt: new Date(),
    })
    .where(and(eq(employees.id, parsed.data.employeeId), eq(employees.organizationId, context.organizationId)));

  if (previousKey) {
    const storage = getStoragePort();
    if (storage.configured) {
      try {
        await storage.remove(previousKey);
      } catch {
        // Best-effort cleanup.
      }
    }
  }

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.EMPLOYEE_UPDATED,
    entityType: 'employee',
    entityId: parsed.data.employeeId,
    metadata: { avatar: 'removed' },
  });

  return { ok: true as const };
}

export async function mapEmployeeAvatarKeys(
  db: OrgContext['db'],
  organizationId: string,
  employeeIds: readonly string[],
): Promise<Map<string, string | null>> {
  const { inArray } = await import('drizzle-orm');
  const out = new Map<string, string | null>();
  if (employeeIds.length === 0) return out;
  if (!(await isIdentityImagesSchemaReady(db))) {
    for (const id of employeeIds) out.set(id, null);
    return out;
  }
  const batch = await db
    .select({ id: employees.id, avatarImageKey: employees.avatarImageKey })
    .from(employees)
    .where(and(eq(employees.organizationId, organizationId), inArray(employees.id, [...employeeIds])));
  for (const row of batch) out.set(row.id, row.avatarImageKey ?? null);
  for (const id of employeeIds) if (!out.has(id)) out.set(id, null);
  return out;
}
