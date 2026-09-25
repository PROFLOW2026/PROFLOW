import 'server-only';

import { sql } from 'drizzle-orm';
import type { DbExecutor } from '@/shared/db/types';
import {
  PROVISION_CHAIN_LEASE_TTL_MS,
  isProvisionLeaseHeld,
  readProvisionChainLease,
  type ProvisionChainLease,
} from '../domain/provision-chain-lease';

function sqlResultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] }).rows ?? []) as T[];
}

function leaseExpiresAt(now: Date): string {
  return new Date(now.getTime() + PROVISION_CHAIN_LEASE_TTL_MS).toISOString();
}

/**
 * One connected row per organization holds the lease (primary first).
 * The WHERE clause matches `canAcquireProvisionLease`: only one isolate
 * can win an unexpired lease for a different token.
 */
export async function acquireStorageProvisionLease(
  db: DbExecutor,
  organizationId: string,
  token: string,
  now: Date = new Date(),
): Promise<{ readonly acquired: boolean; readonly lease: ProvisionChainLease | null }> {
  const expiresAt = leaseExpiresAt(now);
  const result = await db.execute(sql`
    UPDATE public.organization_storage_connections AS c
    SET capabilities_json = jsonb_set(
          COALESCE(c.capabilities_json, '{}'::jsonb),
          '{provisionChainLease}',
          jsonb_build_object('token', ${token}::text, 'expiresAt', ${expiresAt}::text),
          true
        ),
        updated_at = now()
    WHERE c.id = (
      SELECT id
      FROM public.organization_storage_connections
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'connected'
      ORDER BY is_primary DESC, id
      LIMIT 1
    )
    AND (
      COALESCE(c.capabilities_json->'provisionChainLease'->>'expiresAt', '') = ''
      OR (c.capabilities_json->'provisionChainLease'->>'expiresAt')::timestamptz <= now()
      OR c.capabilities_json->'provisionChainLease'->>'token' = ${token}
    )
    RETURNING c.capabilities_json->'provisionChainLease' AS lease
  `);
  const row = sqlResultRows<{ lease?: unknown }>(result)[0];
  if (!row) {
    const current = await readStorageProvisionLease(db, organizationId);
    return { acquired: false, lease: current };
  }
  return { acquired: true, lease: readProvisionChainLease(row.lease) };
}

export async function releaseStorageProvisionLease(
  db: DbExecutor,
  organizationId: string,
  token: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE public.organization_storage_connections AS c
    SET capabilities_json = c.capabilities_json - 'provisionChainLease',
        updated_at = now()
    WHERE c.id = (
      SELECT id
      FROM public.organization_storage_connections
      WHERE organization_id = ${organizationId}::uuid
        AND status = 'connected'
      ORDER BY is_primary DESC, id
      LIMIT 1
    )
    AND c.capabilities_json->'provisionChainLease'->>'token' = ${token}
  `);
}

export async function readStorageProvisionLease(
  db: DbExecutor,
  organizationId: string,
): Promise<ProvisionChainLease | null> {
  const result = await db.execute(sql`
    SELECT capabilities_json->'provisionChainLease' AS lease
    FROM public.organization_storage_connections
    WHERE organization_id = ${organizationId}::uuid
      AND status = 'connected'
    ORDER BY is_primary DESC, id
    LIMIT 1
  `);
  const row = sqlResultRows<{ lease?: unknown }>(result)[0];
  return readProvisionChainLease(row?.lease);
}

export async function isStorageProvisionLeaseHeld(
  db: DbExecutor,
  organizationId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const lease = await readStorageProvisionLease(db, organizationId);
  return isProvisionLeaseHeld(lease, now);
}
