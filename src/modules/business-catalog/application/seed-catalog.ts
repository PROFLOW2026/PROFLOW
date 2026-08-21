import type { DbExecutor } from '@/shared/db/types';
import { insertCatalogEntry } from '../data/catalog.repository';
import {
  DEFAULT_CLIENT_TYPES,
  DEFAULT_ENGAGEMENT_ROLES,
  DEFAULT_LEAD_SOURCES,
  DEFAULT_LOST_REASONS,
  DEFAULT_PAYMENT_TERMS,
  type BusinessCatalogKind,
} from '../domain/types';

/**
 * Seed universal catalogs for a new org (idempotent via onConflictDoNothing).
 * Profile-specific vendor categories / cost codes are applied separately.
 */
export async function seedUniversalBusinessCatalogs(
  db: DbExecutor,
  organizationId: string,
): Promise<void> {
  let sort = 10;
  for (const item of DEFAULT_CLIENT_TYPES) {
    await insertCatalogEntry(db, {
      organizationId,
      kind: 'client_type',
      key: item.key,
      name: item.name,
      sortOrder: sort,
      isSystem: true,
    });
    sort += 10;
  }
  for (const item of DEFAULT_PAYMENT_TERMS) {
    await insertCatalogEntry(db, {
      organizationId,
      kind: 'payment_term',
      key: item.key,
      name: item.name,
      metadata: { ...item.metadata },
      sortOrder: item.sortOrder,
      isSystem: true,
    });
  }
  sort = 10;
  for (const item of DEFAULT_LEAD_SOURCES) {
    await insertCatalogEntry(db, {
      organizationId,
      kind: 'lead_source',
      key: item.key,
      name: item.name,
      sortOrder: sort,
      isSystem: true,
    });
    sort += 10;
  }
  sort = 10;
  for (const item of DEFAULT_LOST_REASONS) {
    await insertCatalogEntry(db, {
      organizationId,
      kind: 'lost_reason',
      key: item.key,
      name: item.name,
      sortOrder: sort,
      isSystem: true,
    });
    sort += 10;
  }
  sort = 10;
  for (const item of DEFAULT_ENGAGEMENT_ROLES) {
    await insertCatalogEntry(db, {
      organizationId,
      kind: 'engagement_role',
      key: item.key,
      name: item.name,
      sortOrder: sort,
      isSystem: true,
    });
    sort += 10;
  }
}

export async function seedCatalogItems(
  db: DbExecutor,
  organizationId: string,
  kind: BusinessCatalogKind,
  items: readonly {
    readonly key: string;
    readonly name: string;
    readonly description?: string;
    readonly parentKey?: string;
    readonly metadata?: Record<string, unknown>;
  }[],
): Promise<void> {
  const keyToId = new Map<string, string>();
  let sort = 10;
  for (const item of items) {
    const parentId = item.parentKey ? keyToId.get(item.parentKey) ?? null : null;
    const row = await insertCatalogEntry(db, {
      organizationId,
      kind,
      key: item.key,
      name: item.name,
      description: item.description ?? null,
      parentId,
      metadata: item.metadata ?? {},
      sortOrder: sort,
      isSystem: true,
    });
    keyToId.set(item.key, row.id);
    sort += 10;
  }
}
