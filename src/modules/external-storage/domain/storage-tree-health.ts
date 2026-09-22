/**
 * Distinguishes OAuth account connection from provider-tree structural health.
 * Stored on organization_storage_connections.capabilities_json.treeHealth.
 */

export type StorageTreeHealthStatus = 'healthy' | 'needs_repair' | 'repairing' | 'unknown';

export type StorageTreeHealthReason =
  | 'root_folder_missing'
  | 'template_incomplete'
  | 'template_missing'
  | 'stale_mappings'
  | null;

export interface StorageTreeHealthCapability {
  readonly status: StorageTreeHealthStatus;
  readonly reason: StorageTreeHealthReason;
  readonly checkedAt: string | null;
}

export interface StorageConnectionCapabilitiesWithTree {
  readonly projectTemplate?: unknown;
  readonly treeHealth?: StorageTreeHealthCapability;
  readonly [key: string]: unknown;
}

export function readStorageTreeHealth(
  capabilities: StorageConnectionCapabilitiesWithTree | null | undefined,
): StorageTreeHealthCapability {
  const raw = capabilities?.treeHealth;
  if (!raw || typeof raw !== 'object') {
    return { status: 'unknown', reason: null, checkedAt: null };
  }
  const status =
    raw.status === 'healthy' ||
    raw.status === 'needs_repair' ||
    raw.status === 'repairing' ||
    raw.status === 'unknown'
      ? raw.status
      : 'unknown';
  const reason =
    raw.reason === 'root_folder_missing' ||
    raw.reason === 'template_incomplete' ||
    raw.reason === 'template_missing' ||
    raw.reason === 'stale_mappings'
      ? raw.reason
      : null;
  return {
    status,
    reason,
    checkedAt: typeof raw.checkedAt === 'string' ? raw.checkedAt : null,
  };
}

export function withStorageTreeHealth(
  capabilities: StorageConnectionCapabilitiesWithTree | null | undefined,
  patch: Partial<StorageTreeHealthCapability>,
): StorageConnectionCapabilitiesWithTree {
  const current = readStorageTreeHealth(capabilities);
  return {
    ...(capabilities ?? {}),
    treeHealth: {
      status: patch.status ?? current.status,
      reason: patch.reason !== undefined ? patch.reason : current.reason,
      checkedAt: patch.checkedAt !== undefined ? patch.checkedAt : current.checkedAt,
    },
  };
}

export function isStorageTreeHealthy(
  capabilities: StorageConnectionCapabilitiesWithTree | null | undefined,
): boolean {
  return readStorageTreeHealth(capabilities).status === 'healthy';
}
