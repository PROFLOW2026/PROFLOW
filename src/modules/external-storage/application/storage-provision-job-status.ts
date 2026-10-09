import 'server-only';

import { eq } from 'drizzle-orm';
import { getAdminDb } from '@/shared/db/client';
import { organizationStorageConnections } from '@drizzle/schema';
import { decideStorageProvisionRecovery } from '../domain/provision-chain-lease';
import { isStorageProvisionLeaseHeld } from './provision-chain-lease';
import { loadStorageProvisionProgress } from './provision-progress';

/** Bounded scan for operator status (OPS-002); matches recovery path scope. */
export const STORAGE_PROVISION_STATUS_SCAN_LIMIT = 200;

export type StorageProvisionJobPhase = 'idle' | 'preparing' | 'running';

export interface StorageProvisionJobStatus {
  readonly phase: StorageProvisionJobPhase;
  readonly connectionsScanned: number;
  readonly preparingConnections: number;
  readonly leaseHeldOrganizations: number;
  readonly recoveryWouldKick: boolean;
  readonly recoveryReason: 'not_preparing' | 'lease_held' | 'preparing' | 'no_connections';
}

/**
 * Read-only provision chain status for internal operators (no HTTP kick).
 */
export async function loadStorageProvisionJobStatus(): Promise<StorageProvisionJobStatus> {
  const db = getAdminDb();
  const rows = await db
    .select({
      id: organizationStorageConnections.id,
      organizationId: organizationStorageConnections.organizationId,
    })
    .from(organizationStorageConnections)
    .where(eq(organizationStorageConnections.status, 'connected'))
    .limit(STORAGE_PROVISION_STATUS_SCAN_LIMIT);

  if (rows.length === 0) {
    return {
      phase: 'idle',
      connectionsScanned: 0,
      preparingConnections: 0,
      leaseHeldOrganizations: 0,
      recoveryWouldKick: false,
      recoveryReason: 'no_connections',
    };
  }

  const leaseByOrg = new Map<string, boolean>();
  const entries: { state: 'ready' | 'preparing'; leaseHeld: boolean }[] = [];
  let preparingConnections = 0;
  let leaseHeldOrganizations = 0;

  for (const row of rows) {
    const progress = await loadStorageProvisionProgress(db, row.organizationId, row.id);
    if (progress.state === 'preparing') preparingConnections += 1;

    let leaseHeld = leaseByOrg.get(row.organizationId);
    if (leaseHeld === undefined) {
      leaseHeld = await isStorageProvisionLeaseHeld(db, row.organizationId);
      leaseByOrg.set(row.organizationId, leaseHeld);
      if (leaseHeld) leaseHeldOrganizations += 1;
    }
    entries.push({ state: progress.state, leaseHeld });
  }

  const decision = decideStorageProvisionRecovery({ entries });
  const phase: StorageProvisionJobPhase =
    leaseHeldOrganizations > 0
      ? 'running'
      : preparingConnections > 0
        ? 'preparing'
        : 'idle';

  return {
    phase,
    connectionsScanned: rows.length,
    preparingConnections,
    leaseHeldOrganizations,
    recoveryWouldKick: decision.kick,
    recoveryReason: decision.kick ? decision.reason : decision.reason,
  };
}
