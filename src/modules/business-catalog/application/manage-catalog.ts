import { z } from 'zod';
import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import { NotFoundError, ValidationError } from '@/shared/errors';
import { assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import type { OrgContext } from '@/shared/auth/context';
import {
  getOrganizationSettingValue,
  upsertOrganizationSettingValue,
} from '@/modules/tenancy';
import {
  archiveCatalogEntry,
  getCatalogEntryById,
  getCatalogEntryByKey,
  insertCatalogEntry,
  listCatalogEntries,
  nextCatalogSortOrder,
  updateCatalogEntry,
} from '../data/catalog.repository';
import {
  archiveDocumentRequirementRule,
  insertDocumentRequirementRule,
  listDocumentRequirementRules,
  nextDocumentRequirementSortOrder,
  type DocumentRequirementRecord,
} from '../data/document-requirements.repository';
import {
  BUSINESS_CATALOG_KINDS,
  type BusinessCatalogKind,
  type CatalogEntryRecord,
  isBusinessCatalogKind,
  PAYMENT_TERM_STRATEGIES,
} from '../domain/types';
import { DEFAULT_PAYMENT_TERM_KEY_SETTING } from './payment-term-defaults';

export const COST_CODES_ENABLED_SETTING_KEY = 'cost_codes_enabled';
export { DEFAULT_PAYMENT_TERM_KEY_SETTING };

const DOC_REQ_MANAGE_CONTEXTS = ['vendor_type', 'subcontract'] as const;

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || 'item';
}

const kindSchema = z.enum(BUSINESS_CATALOG_KINDS);

export async function listBusinessCatalog(
  context: OrgContext,
  kind: string,
  options?: { readonly includeInactive?: boolean; readonly forManage?: boolean },
): Promise<CatalogEntryRecord[]> {
  if (!isBusinessCatalogKind(kind)) {
    throw new ValidationError([{ path: 'kind', message: 'Unknown catalog kind' }]);
  }
  if (options?.forManage) {
    assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  } else {
    assertPermission(context, PERMISSIONS.ORG_READ);
  }
  return listCatalogEntries(context.db, context.organizationId, kind, {
    includeInactive: options?.includeInactive ?? options?.forManage === true,
  });
}

export async function createBusinessCatalogEntry(
  context: OrgContext,
  rawInput: unknown,
): Promise<CatalogEntryRecord> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const schema = z.object({
    kind: kindSchema,
    name: z.string().trim().min(1).max(120),
    key: z.string().trim().min(1).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  });
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const key = parsed.data.key ?? slugify(parsed.data.name);
  if (parsed.data.kind === 'payment_term' && parsed.data.metadata) {
    const strategy = parsed.data.metadata.strategy;
    if (
      typeof strategy === 'string' &&
      !(PAYMENT_TERM_STRATEGIES as readonly string[]).includes(strategy)
    ) {
      throw new ValidationError([{ path: 'metadata.strategy', message: 'Invalid payment term strategy' }]);
    }
  }
  if (parsed.data.parentId) {
    const parent = await getCatalogEntryById(context.db, context.organizationId, parsed.data.parentId);
    if (!parent) throw new NotFoundError('Parent catalog entry');
  }
  const sortOrder = await nextCatalogSortOrder(context.db, context.organizationId, parsed.data.kind);
  const row = await insertCatalogEntry(context.db, {
    organizationId: context.organizationId,
    kind: parsed.data.kind,
    key,
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    parentId: parsed.data.parentId ?? null,
    metadata: parsed.data.metadata ?? {},
    sortOrder,
    isSystem: false,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_catalog_entry',
    entityId: row.id,
    metadata: { kind: row.kind, key: row.key },
  });
  return row;
}

export async function updateBusinessCatalogEntry(
  context: OrgContext,
  rawInput: unknown,
): Promise<CatalogEntryRecord> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const schema = z.object({
    id: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    parentId: z.string().uuid().nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
    sortOrder: z.number().int().optional(),
    isActive: z.boolean().optional(),
  });
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  const updated = await updateCatalogEntry(context.db, context.organizationId, parsed.data.id, {
    name: parsed.data.name,
    description: parsed.data.description,
    parentId: parsed.data.parentId,
    metadata: parsed.data.metadata,
    sortOrder: parsed.data.sortOrder,
    isActive: parsed.data.isActive,
  });
  if (!updated) throw new NotFoundError('Catalog entry');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_catalog_entry',
    entityId: updated.id,
    metadata: { kind: updated.kind, key: updated.key, patch: Object.keys(parsed.data) },
  });
  return updated;
}

export async function deactivateBusinessCatalogEntry(
  context: OrgContext,
  id: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const ok = await archiveCatalogEntry(context.db, context.organizationId, id);
  if (!ok) throw new NotFoundError('Catalog entry');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_catalog_entry',
    entityId: id,
    metadata: { archived: true },
  });
}

export async function getBusinessCatalogEntry(
  context: OrgContext,
  id: string,
): Promise<CatalogEntryRecord | null> {
  assertPermission(context, PERMISSIONS.ORG_READ);
  return getCatalogEntryById(context.db, context.organizationId, id);
}

export async function getCostCodesEnabled(context: OrgContext): Promise<boolean> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    COST_CODES_ENABLED_SETTING_KEY,
  );
  return raw === true;
}

export async function setCostCodesEnabled(
  context: OrgContext,
  enabled: boolean,
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    COST_CODES_ENABLED_SETTING_KEY,
    enabled,
  );
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_setting',
    entityId: context.organizationId,
    metadata: { key: COST_CODES_ENABLED_SETTING_KEY, value: enabled },
  });
}

export async function getDefaultPaymentTermKey(context: OrgContext): Promise<string | null> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const raw = await getOrganizationSettingValue<unknown>(
    context.db,
    context.organizationId,
    DEFAULT_PAYMENT_TERM_KEY_SETTING,
  );
  return typeof raw === 'string' && raw.trim() ? raw.trim() : null;
}

export async function setDefaultPaymentTermKey(
  context: OrgContext,
  catalogKey: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const key = catalogKey.trim();
  if (!key) {
    throw new ValidationError([{ path: 'defaultPaymentTermKey', message: 'Key is required' }]);
  }
  const entry = await getCatalogEntryByKey(context.db, context.organizationId, 'payment_term', key);
  if (!entry || !entry.isActive || entry.archivedAt) {
    throw new NotFoundError('Payment term');
  }
  await upsertOrganizationSettingValue(
    context.db,
    context.organizationId,
    DEFAULT_PAYMENT_TERM_KEY_SETTING,
    key,
  );
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'organization_setting',
    entityId: context.organizationId,
    metadata: { key: DEFAULT_PAYMENT_TERM_KEY_SETTING, value: key, catalogEntryId: entry.id },
  });
}

export async function listDocumentRequirements(
  context: OrgContext,
  options?: { readonly includeInactive?: boolean; readonly forManage?: boolean },
): Promise<DocumentRequirementRecord[]> {
  if (options?.forManage) {
    assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  } else {
    assertPermission(context, PERMISSIONS.ORG_READ);
  }
  const rows = await listDocumentRequirementRules(context.db, context.organizationId, {
    includeInactive: options?.includeInactive ?? options?.forManage === true,
  });
  return rows.filter(
    (row) =>
      row.contextKind === 'vendor_type' ||
      row.contextKind === 'subcontract',
  );
}

export async function createDocumentRequirement(
  context: OrgContext,
  rawInput: unknown,
): Promise<DocumentRequirementRecord> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const schema = z.object({
    contextKind: z.enum(DOC_REQ_MANAGE_CONTEXTS),
    contextKey: z.string().trim().min(1).max(80).nullable().optional(),
    documentTypeKey: z.string().trim().min(1).max(80),
    label: z.string().trim().max(120).nullable().optional(),
    required: z.boolean().optional(),
  });
  const parsed = schema.safeParse(rawInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  if (parsed.data.contextKind === 'vendor_type' && !parsed.data.contextKey) {
    throw new ValidationError([{ path: 'contextKey', message: 'contextKey required for vendor_type' }]);
  }
  const sortOrder = await nextDocumentRequirementSortOrder(context.db, context.organizationId);
  const row = await insertDocumentRequirementRule(context.db, {
    organizationId: context.organizationId,
    contextKind: parsed.data.contextKind,
    contextKey: parsed.data.contextKind === 'subcontract' ? null : (parsed.data.contextKey ?? null),
    documentTypeKey: parsed.data.documentTypeKey,
    label: parsed.data.label ?? null,
    required: parsed.data.required ?? true,
    sortOrder,
  });
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'document_requirement_rule',
    entityId: row.id,
    metadata: { contextKind: row.contextKind, documentTypeKey: row.documentTypeKey },
  });
  return row;
}

export async function deactivateDocumentRequirement(
  context: OrgContext,
  id: string,
): Promise<void> {
  assertPermission(context, PERMISSIONS.SETTINGS_MANAGE);
  const ok = await archiveDocumentRequirementRule(context.db, context.organizationId, id);
  if (!ok) throw new NotFoundError('Document requirement');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.SETTINGS_UPDATED,
    entityType: 'document_requirement_rule',
    entityId: id,
    metadata: { archived: true },
  });
}

export type { BusinessCatalogKind, CatalogEntryRecord, DocumentRequirementRecord };
