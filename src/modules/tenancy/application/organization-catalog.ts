import { z } from 'zod';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { ConflictError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  archiveOrganizationDomain,
  DOCUMENT_TYPE_KEY_PREFIX,
  documentTypeStorageKey,
  insertOrganizationDomain,
  listDocumentTypeCatalog,
  listServiceDomains,
  nextDomainSortOrder,
  renameOrganizationDomain,
  setOrganizationDomainEnabled,
  type OrganizationDomainRow,
} from '../data/organization-domains.repository';

const nameSchema = z.object({
  name: z.string().trim().min(2).max(80),
});

const idSchema = z.object({
  id: z.string().uuid(),
});

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return base || 'item';
}

export async function listOrganizationServiceDomains(
  context: OrgContext,
): Promise<OrganizationDomainRow[]> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  return listServiceDomains(context.db, context.organizationId);
}

export async function listOrganizationDocumentTypes(
  context: OrgContext,
): Promise<OrganizationDomainRow[]> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  return listDocumentTypeCatalog(context.db, context.organizationId);
}

/** Public read for pickers (projects / documents) - ORG_READ is enough. */
export async function listEnabledServiceDomainsForPicker(
  context: OrgContext,
): Promise<OrganizationDomainRow[]> {
  assertPermission(context, PERMISSIONS.ORG_READ);
  const rows = await listServiceDomains(context.db, context.organizationId);
  return rows.filter((row) => row.enabled);
}

export async function listEnabledDocumentTypesForPicker(
  context: OrgContext,
): Promise<OrganizationDomainRow[]> {
  assertPermission(context, PERMISSIONS.ORG_READ);
  const rows = await listDocumentTypeCatalog(context.db, context.organizationId);
  return rows.filter((row) => row.enabled);
}

export async function createServiceDomain(
  context: OrgContext,
  rawInput: unknown,
): Promise<OrganizationDomainRow> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const parsed = nameSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const sortOrder = await nextDomainSortOrder(context.db, context.organizationId, null);
  try {
    const row = await insertOrganizationDomain(context.db, {
      organizationId: context.organizationId,
      name: parsed.data.name,
      sortOrder,
    });
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      entityType: 'organization_domain',
      entityId: row.id,
      after: { key: row.key, name: row.name, kind: 'service_domain' },
    });
    return row;
  } catch {
    throw new ConflictError('Could not create domain', 'errors.conflict');
  }
}

export async function createDocumentType(
  context: OrgContext,
  rawInput: unknown,
): Promise<OrganizationDomainRow> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const parsed = nameSchema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const sortOrder = await nextDomainSortOrder(
    context.db,
    context.organizationId,
    DOCUMENT_TYPE_KEY_PREFIX,
  );
  try {
    const row = await insertOrganizationDomain(context.db, {
      organizationId: context.organizationId,
      name: parsed.data.name,
      key: documentTypeStorageKey(slugify(parsed.data.name)),
      sortOrder,
    });
    await recordAuditEvent(context, {
      action: AUDIT_ACTIONS.SETTINGS_UPDATED,
      entityType: 'organization_domain',
      entityId: row.id,
      after: { key: row.key, name: row.name, kind: 'document_type' },
    });
    return row;
  } catch {
    throw new ConflictError('Could not create document type', 'errors.conflict');
  }
}

export async function renameCatalogItem(
  context: OrgContext,
  rawInput: unknown,
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const parsed = idSchema.extend(nameSchema.shape).safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const updated = await renameOrganizationDomain(
    context.db,
    context.organizationId,
    parsed.data.id,
    parsed.data.name,
  );
  if (!updated) throw new NotFoundError('Catalog item');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_domain',
    entityId: updated.id,
    after: { name: updated.name },
  });
}

export async function setCatalogItemEnabled(
  context: OrgContext,
  rawInput: { id: string; enabled: boolean },
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const parsed = idSchema.extend({ enabled: z.boolean() }).safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const updated = await setOrganizationDomainEnabled(
    context.db,
    context.organizationId,
    parsed.data.id,
    parsed.data.enabled,
  );
  if (!updated) throw new NotFoundError('Catalog item');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_domain',
    entityId: updated.id,
    after: { enabled: updated.enabled },
  });
}

export async function archiveCatalogItem(context: OrgContext, id: string): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const parsed = idSchema.safeParse({ id });
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const updated = await archiveOrganizationDomain(
    context.db,
    context.organizationId,
    parsed.data.id,
  );
  if (!updated) throw new NotFoundError('Catalog item');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_domain',
    entityId: updated.id,
    before: { archivedAt: null },
    after: { archivedAt: new Date().toISOString() },
  });
}
