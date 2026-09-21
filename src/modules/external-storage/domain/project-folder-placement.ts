import { formatProjectDisplayName } from '@/modules/projects/domain/display';

/** Canonical provider folder name. Uses the project document number, not a storage-only sequence. */
export function projectStorageFolderName(
  name: string,
  documentNumber: string | null | undefined,
): string {
  return formatProjectDisplayName(name, documentNumber);
}

/**
 * A ready project_root is canonical only when its parent is the organization projects_root.
 * A folder nested under a client, or under the organization root, is legacy.
 */
export function isCanonicalProjectRootParent(
  projectRootParentId: string | null | undefined,
  projectsRootId: string | null | undefined,
): boolean {
  return Boolean(projectsRootId) && projectRootParentId === projectsRootId;
}

export interface StorageProvisionProgress {
  readonly clientsTotal: number;
  readonly clientsProvisioned: number;
  readonly projectsTotal: number;
  readonly projectsProvisioned: number;
  readonly projectFoldersTotal: number;
  readonly projectFoldersProvisioned: number;
  readonly state: 'ready' | 'preparing';
}
export const STORAGE_PROVISION_CLIENT_BATCH = 10;
export const STORAGE_PROVISION_PROJECT_BATCH = 2;
export const STORAGE_PROVISION_MAX_CHAIN = 400;
export const STORAGE_PROVISION_MAX_RATE_LIMITS = 8;
export const STORAGE_PROVISION_RATE_LIMIT_DELAY_MS = 8_000;

export function nextStorageProvisionStep(input: {
  readonly remaining: number;
  readonly rateLimited: boolean;
  readonly chain: number;
  readonly rateLimitStreak: number;
}): { readonly continue: boolean; readonly delayMs: number; readonly chain: number; readonly rateLimitStreak: number } {
  if (input.rateLimited) {
    const streak = input.rateLimitStreak + 1;
    if (streak >= STORAGE_PROVISION_MAX_RATE_LIMITS || input.chain + 1 >= STORAGE_PROVISION_MAX_CHAIN) {
      return { continue: false, delayMs: 0, chain: input.chain, rateLimitStreak: streak };
    }
    return {
      continue: true,
      delayMs: STORAGE_PROVISION_RATE_LIMIT_DELAY_MS,
      chain: input.chain + 1,
      rateLimitStreak: streak,
    };
  }
  if (input.remaining <= 0 || input.chain + 1 >= STORAGE_PROVISION_MAX_CHAIN) {
    return { continue: false, delayMs: 0, chain: input.chain, rateLimitStreak: 0 };
  }
  return { continue: true, delayMs: 0, chain: input.chain + 1, rateLimitStreak: 0 };
}
