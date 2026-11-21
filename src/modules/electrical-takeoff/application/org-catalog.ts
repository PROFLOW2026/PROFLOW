import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { hasPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { asServiceRoleWrite } from '@/shared/db/service-role-write';
import type { CatalogType, CatalogTypeArchiveInput, CatalogTypeCreateInput, CatalogTypeUpdateInput } from '../domain/contracts';
import {
  applyOrgDisplayName,
  buildCustomCatalogType,
  findActiveNameDuplicate,
  isDefaultCatalogKey,
  mergeOrgCatalog,
  normalizeCatalogNameHe,
} from '../domain/catalog';
import { TakeoffError } from '../domain/errors';
import { listCatalogOverrides, upsertCatalogType } from '../data/takeoff.repository';
import type { DbExecutor } from '@/shared/db/types';

export function isPgUniqueViolation(error: unknown): boolean {
  let current: unknown = error;
  for (let depth = 0; depth < 6 && current; depth++) {
    const code = (current as { code?: string }).code;
    if (code === '23505') return true;
    const constraint = (current as { constraint?: string }).constraint;
    if (constraint === 'takeoff_catalog_types_org_name_active_uq') return true;
    current = (current as { cause?: unknown }).cause;
  }
  return false;
}

export async function loadCatalogForOrg(db: DbExecutor, organizationId: string): Promise<CatalogType[]> {
  const overrides = await listCatalogOverrides(db, organizationId);
  return mergeOrgCatalog(
    overrides.map((row) => ({
      key: row.key,
      archived: row.archived,
      payload: row.payload,
    })),
  );
}

function assertLibraryManage(context: OrgContext): void {
  if (!hasPermission(context, PERMISSIONS.TAKEOFF_LIBRARY_MANAGE)) {
    throw new TakeoffError('forbidden');
  }
}

async function lockOrgCatalog(db: DbExecutor, organizationId: string): Promise<void> {
  await db.execute(sql`select pg_advisory_xact_lock(hashtext(${organizationId} || ':takeoff-catalog'))`);
}

async function writeCatalogRow(context: OrgContext, type: CatalogType): Promise<CatalogType> {
  try {
    const saved = await asServiceRoleWrite(context.db, async () => {
      await lockOrgCatalog(context.db, context.organizationId);
      if (!type.archived) {
        const latest = await loadCatalogForOrg(context.db, context.organizationId);
        if (findActiveNameDuplicate(latest, type.nameHe, type.key)) {
          throw new TakeoffError('catalog_duplicate');
        }
      }
      return upsertCatalogType(context.db, {
        organizationId: context.organizationId,
        key: type.key,
        payload: type as unknown as Record<string, unknown>,
        builtIn: false,
        archived: type.archived,
        nameNorm: type.archived ? '' : normalizeCatalogNameHe(type.nameHe),
      });
    });
    return (saved.payload as unknown as CatalogType) ?? type;
  } catch (error) {
    if (error instanceof TakeoffError) throw error;
    if (isPgUniqueViolation(error)) throw new TakeoffError('catalog_duplicate');
    throw error;
  }
}

export async function listOrgCatalogUseCase(context: OrgContext): Promise<CatalogType[]> {
  return loadCatalogForOrg(context.db, context.organizationId);
}

export async function createOrgCatalogTypeUseCase(
  context: OrgContext,
  input: CatalogTypeCreateInput,
): Promise<CatalogType> {
  assertLibraryManage(context);
  const nameHe = normalizeCatalogNameHe(input.nameHe);
  if (!nameHe) throw new TakeoffError('catalog_invalid');
  const catalog = await loadCatalogForOrg(context.db, context.organizationId);
  if (findActiveNameDuplicate(catalog, nameHe)) throw new TakeoffError('catalog_duplicate');
  const type = buildCustomCatalogType({ category: input.category, nameHe, catalog });
  return writeCatalogRow(context, type);
}

export async function updateOrgCatalogTypeUseCase(
  context: OrgContext,
  input: CatalogTypeUpdateInput,
): Promise<CatalogType> {
  assertLibraryManage(context);
  const nameHe = normalizeCatalogNameHe(input.nameHe);
  if (!nameHe) throw new TakeoffError('catalog_invalid');
  const catalog = await loadCatalogForOrg(context.db, context.organizationId);
  const existing = catalog.find((type) => type.key === input.key);
  if (!existing) throw new TakeoffError('not_found');
  if (existing.archived) throw new TakeoffError('catalog_type_archived');
  if (findActiveNameDuplicate(catalog, nameHe, existing.key)) throw new TakeoffError('catalog_duplicate');
  const next = applyOrgDisplayName(existing, nameHe);
  return writeCatalogRow(context, next);
}

export async function archiveOrgCatalogTypeUseCase(
  context: OrgContext,
  input: CatalogTypeArchiveInput,
): Promise<CatalogType> {
  assertLibraryManage(context);
  const catalog = await loadCatalogForOrg(context.db, context.organizationId);
  const existing = catalog.find((type) => type.key === input.key);
  if (!existing) throw new TakeoffError('not_found');
  if (isDefaultCatalogKey(existing.key)) throw new TakeoffError('catalog_invalid');
  if (!input.archived) {
    if (findActiveNameDuplicate(catalog, existing.nameHe, existing.key)) {
      throw new TakeoffError('catalog_duplicate');
    }
  }
  const next = { ...existing, archived: input.archived, keywordsHe: [] };
  return writeCatalogRow(context, next);
}

export async function saveOrgCatalogTypeUseCase(context: OrgContext, type: CatalogType): Promise<CatalogType> {
  const existing = (await loadCatalogForOrg(context.db, context.organizationId)).find((row) => row.key === type.key);
  if (!existing) {
    return createOrgCatalogTypeUseCase(context, { category: type.category, nameHe: type.nameHe });
  }
  if (type.archived !== existing.archived) {
    return archiveOrgCatalogTypeUseCase(context, { key: type.key, archived: type.archived });
  }
  return updateOrgCatalogTypeUseCase(context, { key: type.key, nameHe: type.nameHe });
}
