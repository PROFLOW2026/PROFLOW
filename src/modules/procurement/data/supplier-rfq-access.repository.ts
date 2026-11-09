import 'server-only';

import { sql } from 'drizzle-orm';
import type { OrgContext } from '@/shared/auth/context';
import { getAdminDb } from '@/shared/db/client';
import type { DbExecutor } from '@/shared/db/types';
import {
  areSupplierRfqAccessTokensTablesAvailable,
} from './supplier-rfq-access-persistence';

export interface SupplierRfqAccessTokenRow {
  readonly id: string;
  readonly organizationId: string;
  readonly rfqId: string;
  readonly vendorId: string;
  readonly tokenHash: string;
  readonly expiresAt: Date;
  readonly usedAt: Date | null;
  readonly createdAt: Date;
}

type TokenDbRow = {
  id: string;
  organization_id: string;
  rfq_id: string;
  vendor_id: string;
  token_hash: string;
  expires_at: Date | string;
  used_at: Date | string | null;
  created_at: Date | string;
};

function isMissingRelationError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: string }).code;
  return code === '42P01' || code === '42703';
}

function readRows(result: unknown): TokenDbRow[] {
  return (Array.isArray(result) ? result : (result as { rows: TokenDbRow[] }).rows) ?? [];
}

function parseDate(value: Date | string): Date {
  return value instanceof Date ? value : new Date(value);
}

function rowFromDb(row: TokenDbRow): SupplierRfqAccessTokenRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    rfqId: row.rfq_id,
    vendorId: row.vendor_id,
    tokenHash: row.token_hash,
    expiresAt: parseDate(row.expires_at),
    usedAt: row.used_at ? parseDate(row.used_at) : null,
    createdAt: parseDate(row.created_at),
  };
}

export async function insertSupplierRfqAccessToken(
  context: Pick<OrgContext, 'organizationId' | 'db'>,
  input: {
    readonly id: string;
    readonly rfqId: string;
    readonly vendorId: string;
    readonly tokenHash: string;
    readonly expiresAt: Date;
  },
): Promise<void> {
  if (!areSupplierRfqAccessTokensTablesAvailable()) {
    throw new Error('supplier_rfq_access_tokens not available');
  }

  await context.db.execute(sql`
    insert into supplier_rfq_access_tokens (
      id,
      organization_id,
      rfq_id,
      vendor_id,
      token_hash,
      expires_at
    ) values (
      ${input.id},
      ${context.organizationId},
      ${input.rfqId},
      ${input.vendorId},
      ${input.tokenHash},
      ${input.expiresAt}
    )
  `);
}

export async function findSupplierRfqAccessTokenByHash(
  tokenHash: string,
): Promise<SupplierRfqAccessTokenRow | null> {
  if (!areSupplierRfqAccessTokensTablesAvailable()) return null;

  try {
    const result = await getAdminDb().execute(sql`
      select
        id,
        organization_id,
        rfq_id,
        vendor_id,
        token_hash,
        expires_at,
        used_at,
        created_at
      from supplier_rfq_access_tokens
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

/**
 * Marks a token used inside the caller's transaction (one-time).
 * Returns false when the row was already used or expired.
 */
export async function markSupplierRfqAccessTokenUsed(
  db: DbExecutor,
  tokenHash: string,
): Promise<SupplierRfqAccessTokenRow | null> {
  if (!areSupplierRfqAccessTokensTablesAvailable()) return null;

  try {
    const result = await db.execute(sql`
      update supplier_rfq_access_tokens
      set used_at = now()
      where token_hash = ${tokenHash}
        and used_at is null
        and expires_at > now()
      returning
        id,
        organization_id,
        rfq_id,
        vendor_id,
        token_hash,
        expires_at,
        used_at,
        created_at
    `);
    const row = readRows(result)[0];
    return row ? rowFromDb(row) : null;
  } catch (error) {
    if (isMissingRelationError(error)) return null;
    throw error;
  }
}
