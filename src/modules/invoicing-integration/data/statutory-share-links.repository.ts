import 'server-only';

import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import { NotFoundError } from '@/shared/errors';
import {
  areStatutoryShareLinksTablesAvailable,
  isStatutoryShareTestDoubleEnvironment,
} from './statutory-share-persistence';

export interface StatutoryShareLinkRow {
  readonly id: string;
  readonly organizationId: string;
  readonly externalDocumentId: string;
  readonly tokenHash: string;
  readonly createdByUserId: string;
  readonly expiresAt: Date;
  readonly revokedAt: Date | null;
}

type ShareLinkDbRow = {
  id: string;
  organization_id: string;
  external_document_id: string;
  token_hash: string;
  created_by_user_id: string;
  expires_at: Date | string;
  revoked_at: Date | string | null;
};

const inMemoryByOrg = new Map<string, Map<string, StatutoryShareLinkRow>>();

let useInMemoryStoreForTests = false;

/** PGlite / unit tests without 0187 applied — never in production. */
export function setStatutoryShareLinksInMemoryStoreForTests(value: boolean): void {
  if (value && !isStatutoryShareTestDoubleEnvironment()) {
    throw new Error('Statutory share in-memory store is allowed only in test environments');
  }
  useInMemoryStoreForTests = value;
}

export function clearStatutoryShareLinksStoreForTests(): void {
  inMemoryByOrg.clear();
}

function orgMap(organizationId: string): Map<string, StatutoryShareLinkRow> {
  let map = inMemoryByOrg.get(organizationId);
  if (!map) {
    map = new Map();
    inMemoryByOrg.set(organizationId, map);
  }
  return map;
}

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '42P01' || code === '42703';
}

function rowFromDb(row: ShareLinkDbRow): StatutoryShareLinkRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    externalDocumentId: row.external_document_id,
    tokenHash: row.token_hash,
    createdByUserId: row.created_by_user_id,
    expiresAt: row.expires_at instanceof Date ? row.expires_at : new Date(row.expires_at),
    revokedAt: row.revoked_at
      ? row.revoked_at instanceof Date
        ? row.revoked_at
        : new Date(row.revoked_at)
      : null,
  };
}

function readRows(result: unknown): ShareLinkDbRow[] {
  return (Array.isArray(result) ? result : (result as { rows: ShareLinkDbRow[] }).rows) ?? [];
}

async function selectShareLink(
  db: DbExecutor,
  organizationId: string,
  linkId: string,
): Promise<StatutoryShareLinkRow | null> {
  try {
    const result = await db.execute(sql`
      select
        id,
        organization_id,
        external_document_id,
        token_hash,
        created_by_user_id,
        expires_at,
        revoked_at
      from statutory_document_share_links
      where organization_id = ${organizationId}
        and id = ${linkId}
      limit 1
    `);
    const row = readRows(result)[0];
    return row ? rowFromDb(row) : null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

export async function insertStatutoryShareLink(
  context: Pick<OrgContext, 'organizationId' | 'userId' | 'db'>,
  input: {
    id: string;
    externalDocumentId: string;
    tokenHash: string;
    createdByUserId: string;
    expiresAt: Date;
  },
): Promise<void> {
  if (!areStatutoryShareLinksTablesAvailable()) {
    throw new Error('statutory_document_share_links not available');
  }

  if (useInMemoryStoreForTests && isStatutoryShareTestDoubleEnvironment()) {
    const row: StatutoryShareLinkRow = {
      id: input.id,
      organizationId: context.organizationId,
      externalDocumentId: input.externalDocumentId,
      tokenHash: input.tokenHash,
      createdByUserId: input.createdByUserId,
      expiresAt: input.expiresAt,
      revokedAt: null,
    };
    orgMap(context.organizationId).set(input.id, row);
    return;
  }

  await context.db.execute(sql`
    insert into statutory_document_share_links (
      id,
      organization_id,
      external_document_id,
      token_hash,
      created_by_user_id,
      expires_at
    ) values (
      ${input.id},
      ${context.organizationId},
      ${input.externalDocumentId},
      ${input.tokenHash},
      ${input.createdByUserId},
      ${input.expiresAt.toISOString()}
    )
  `);
}

export async function findStatutoryShareLinkById(
  organizationId: string,
  linkId: string,
): Promise<StatutoryShareLinkRow | null> {
  if (!areStatutoryShareLinksTablesAvailable()) return null;

  if (useInMemoryStoreForTests && isStatutoryShareTestDoubleEnvironment()) {
    return orgMap(organizationId).get(linkId) ?? null;
  }

  return selectShareLink(getAdminDb(), organizationId, linkId);
}

export async function findStatutoryShareLinkByTokenHash(
  tokenHash: string,
): Promise<StatutoryShareLinkRow | null> {
  if (!areStatutoryShareLinksTablesAvailable()) return null;

  if (useInMemoryStoreForTests && isStatutoryShareTestDoubleEnvironment()) {
    for (const map of inMemoryByOrg.values()) {
      for (const row of map.values()) {
        if (row.tokenHash === tokenHash) return row;
      }
    }
    return null;
  }

  try {
    const result = await getAdminDb().execute(sql`
      select
        id,
        organization_id,
        external_document_id,
        token_hash,
        created_by_user_id,
        expires_at,
        revoked_at
      from statutory_document_share_links
      where token_hash = ${tokenHash}
      limit 1
    `);
    const row = readRows(result)[0];
    return row ? rowFromDb(row) : null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}

export async function recordStatutoryShareAccess(
  linkId: string,
  organizationId: string,
): Promise<void> {
  if (!areStatutoryShareLinksTablesAvailable()) {
    throw new NotFoundError('StatutoryShareLink');
  }

  if (useInMemoryStoreForTests && isStatutoryShareTestDoubleEnvironment()) {
    const row = orgMap(organizationId).get(linkId);
    if (!row) throw new NotFoundError('StatutoryShareLink');
    return;
  }

  try {
    const result = await getAdminDb().execute(sql`
      update statutory_document_share_links
      set
        access_count = access_count + 1,
        last_accessed_at = now()
      where id = ${linkId}
        and organization_id = ${organizationId}
    `);
    const rowCount =
      typeof result === 'object' && result !== null && 'rowCount' in result
        ? Number((result as { rowCount: number }).rowCount)
        : 0;
    if (!rowCount) throw new NotFoundError('StatutoryShareLink');
  } catch (error) {
    if (isMissingRelationError(error)) throw new NotFoundError('StatutoryShareLink');
    throw error;
  }
}
