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
/** Soft safety rail; when hit with work remaining, chain resets and continues (never permanent stop). */
export const STORAGE_PROVISION_MAX_CHAIN = 400;
/** @deprecated Rate-limit streaks never permanently stop provisioning; kept for log compatibility. */
export const STORAGE_PROVISION_MAX_RATE_LIMITS = Number.POSITIVE_INFINITY;
export const STORAGE_PROVISION_RATE_LIMIT_DELAY_MS = 8_000;
/** Cap backoff so batch + wait + next HTTP kick fit within worker maxDuration (300s). */
export const STORAGE_PROVISION_RATE_LIMIT_DELAY_CAP_MS = 60_000;

/**
 * Decide whether to schedule another provision worker hop.
 * Transient provider throttling (429 / 5xx) always continues with bounded exponential backoff.
 * Permanent stop only when remaining === 0 (or caller sets a fatal/non-retryable error separately).
 */
export function nextStorageProvisionStep(input: {
  readonly remaining: number;
  readonly rateLimited: boolean;
  readonly chain: number;
  readonly rateLimitStreak: number;
}): { readonly continue: boolean; readonly delayMs: number; readonly chain: number; readonly rateLimitStreak: number } {
  if (input.rateLimited) {
    const streak = input.rateLimitStreak + 1;
    const exp = Math.min(streak - 1, 6);
    const delayMs = Math.min(
      STORAGE_PROVISION_RATE_LIMIT_DELAY_MS * 2 ** exp,
      STORAGE_PROVISION_RATE_LIMIT_DELAY_CAP_MS,
    );
    // Reset chain counter under the soft max so long throttled runs never hard-stop.
    const nextChain = input.chain + 1 >= STORAGE_PROVISION_MAX_CHAIN ? 0 : input.chain + 1;
    return {
      continue: true,
      delayMs,
      chain: nextChain,
      rateLimitStreak: streak,
    };
  }
  if (input.remaining <= 0) {
    return { continue: false, delayMs: 0, chain: input.chain, rateLimitStreak: 0 };
  }
  if (input.chain + 1 >= STORAGE_PROVISION_MAX_CHAIN) {
    return {
      continue: true,
      delayMs: STORAGE_PROVISION_RATE_LIMIT_DELAY_MS,
      chain: 0,
      rateLimitStreak: 0,
    };
  }
  return { continue: true, delayMs: 0, chain: input.chain + 1, rateLimitStreak: 0 };
}
