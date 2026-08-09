import { and, asc, eq, isNull, like, notLike, sql } from 'drizzle-orm';
import { organizationDomains } from '@drizzle/schema';
import type { DbExecutor } from '@/shared/db/types';
import type { OrganizationDomainRow } from '../domain/organization-domains';

export const DOCUMENT_TYPE_KEY_PREFIX = 'document_type:';
export type { OrganizationDomainRow };

function mapRow(row: typeof organizationDomains.$inferSelect): OrganizationDomainRow {
  return {
    id: row.id,
    key: row.key,
    name: row.name,
    enabled: row.enabled,
    sortOrder: row.sortOrder,
    archivedAt: row.archivedAt,
  };
}

function slugifyKey(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48);
  return base || 'item';
}

export async function listServiceDomains(
  db: DbExecutor,
  organizationId: string,
): Promise<OrganizationDomainRow[]> {
  const rows = await db
    .select()
    .from(organizationDomains)
    .where(
      and(
        eq(organizationDomains.organizationId, organizationId),
        isNull(organizationDomains.archivedAt),
        notLike(organizationDomains.key, `${DOCUMENT_TYPE_KEY_PREFIX}%`),
      ),
    )
    .orderBy(asc(organizationDomains.sortOrder), asc(organizationDomains.name));

  return rows.map(mapRow);
}

export async function listDocumentTypeCatalog(
  db: DbExecutor,
  organizationId: string,
): Promise<OrganizationDomainRow[]> {
  const rows = await db
    .select()
    .from(organizationDomains)
    .where(
      and(
        eq(organizationDomains.organizationId, organizationId),
        isNull(organizationDomains.archivedAt),
        like(organizationDomains.key, `${DOCUMENT_TYPE_KEY_PREFIX}%`),
      ),
    )
    .orderBy(asc(organizationDomains.sortOrder), asc(organizationDomains.name));

  return rows.map(mapRow);
}

export async function insertOrganizationDomain(
  db: DbExecutor,
  input: {
    organizationId: string;
    name: string;
    /** When set, key is forced (e.g. document_type:permit). */
    key?: string;
    sortOrder?: number;
  },
): Promise<OrganizationDomainRow> {
  const keyBase = input.key ?? slugifyKey(input.name);
  let key = keyBase;
  let attempt = 0;

  while (attempt < 5) {
    try {
      const [row] = await db
        .insert(organizationDomains)
        .values({
          organizationId: input.organizationId,
          key,
          name: input.name,
          enabled: true,
          sortOrder: input.sortOrder ?? 100 + attempt,
        })
        .returning();
      return mapRow(row!);
    } catch {
      attempt += 1;
      key = `${keyBase}_${attempt}`;
    }
  }

  throw new Error('Could not create organization domain');
}

export async function renameOrganizationDomain(
  db: DbExecutor,
  organizationId: string,
  domainId: string,
  name: string,
): Promise<OrganizationDomainRow | null> {
  const [row] = await db
    .update(organizationDomains)
    .set({ name })
    .where(
      and(
        eq(organizationDomains.id, domainId),
        eq(organizationDomains.organizationId, organizationId),
        isNull(organizationDomains.archivedAt),
      ),
    )
    .returning();
  return row ? mapRow(row) : null;
}

export async function setOrganizationDomainEnabled(
  db: DbExecutor,
  organizationId: string,
  domainId: string,
  enabled: boolean,
): Promise<OrganizationDomainRow | null> {
  const [row] = await db
    .update(organizationDomains)
    .set({ enabled })
    .where(
      and(
        eq(organizationDomains.id, domainId),
        eq(organizationDomains.organizationId, organizationId),
        isNull(organizationDomains.archivedAt),
      ),
    )
    .returning();
  return row ? mapRow(row) : null;
}

export async function archiveOrganizationDomain(
  db: DbExecutor,
  organizationId: string,
  domainId: string,
): Promise<OrganizationDomainRow | null> {
  const [row] = await db
    .update(organizationDomains)
    .set({ archivedAt: new Date() })
    .where(
      and(
        eq(organizationDomains.id, domainId),
        eq(organizationDomains.organizationId, organizationId),
        isNull(organizationDomains.archivedAt),
      ),
    )
    .returning();
  return row ? mapRow(row) : null;
}

export async function nextDomainSortOrder(
  db: DbExecutor,
  organizationId: string,
  keyPrefix: string | null,
): Promise<number> {
  const conditions = [
    eq(organizationDomains.organizationId, organizationId),
    isNull(organizationDomains.archivedAt),
  ];
  if (keyPrefix) {
    conditions.push(like(organizationDomains.key, `${keyPrefix}%`));
  } else {
    conditions.push(notLike(organizationDomains.key, `${DOCUMENT_TYPE_KEY_PREFIX}%`));
  }

  const [row] = await db
    .select({
      maxSort: sql<number>`coalesce(max(${organizationDomains.sortOrder}), 0)`,
    })
    .from(organizationDomains)
    .where(and(...conditions));

  return Number(row?.maxSort ?? 0) + 1;
}

export function documentTypeStorageKey(slug: string): string {
  return `${DOCUMENT_TYPE_KEY_PREFIX}${slug}`;
}

export function documentTypeDisplayKey(storageKey: string): string {
  return storageKey.startsWith(DOCUMENT_TYPE_KEY_PREFIX)
    ? storageKey.slice(DOCUMENT_TYPE_KEY_PREFIX.length)
    : storageKey;
}
