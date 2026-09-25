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
/**
 * Hard cap on chained worker hops in one run.
 * When hit with work remaining, stop this request and persist a retryable deferral.
 * A later worker kick (chain 0) resumes. The counter must not wrap to 0 and continue.
 */
export const STORAGE_PROVISION_MAX_CHAIN = 400;
/** Visible, retryable connection.lastError when the hop cap stops a run with work left. */
export const STORAGE_PROVISION_CHAIN_DEFERRED_ERROR = 'provision_chain_deferred';
/** @deprecated Rate-limit streaks do not stop provisioning before the chain cap. */
export const STORAGE_PROVISION_MAX_RATE_LIMITS = Number.POSITIVE_INFINITY;
export const STORAGE_PROVISION_RATE_LIMIT_DELAY_MS = 8_000;
/** Cap backoff so batch + wait + next HTTP kick fit within worker maxDuration (300s). */
export const STORAGE_PROVISION_RATE_LIMIT_DELAY_CAP_MS = 60_000;

export interface StorageProvisionStep {
  readonly continue: boolean;
  readonly delayMs: number;
  readonly chain: number;
  readonly rateLimitStreak: number;
  /** True when the hop cap stopped this run while work remains. Caller must persist a retryable deferral. */
  readonly deferred: boolean;
}

/**
 * Decide whether to schedule another provision worker hop.
 * Transient throttling (429 / 5xx) continues with bounded backoff until the chain cap.
 * At the cap, stop this request (deferred) so a later worker resume can continue.
 * Non-retryable errors are handled by the caller and are not scheduled here.
 */
export function nextStorageProvisionStep(input: {
  readonly remaining: number;
  readonly rateLimited: boolean;
  readonly chain: number;
  readonly rateLimitStreak: number;
}): StorageProvisionStep {
  if (input.remaining <= 0) {
    return { continue: false, delayMs: 0, chain: input.chain, rateLimitStreak: 0, deferred: false };
  }
  if (input.chain + 1 >= STORAGE_PROVISION_MAX_CHAIN) {
    return {
      continue: false,
      delayMs: 0,
      chain: input.chain,
      rateLimitStreak: input.rateLimited ? input.rateLimitStreak + 1 : input.rateLimitStreak,
      deferred: true,
    };
  }
  if (input.rateLimited) {
    const streak = input.rateLimitStreak + 1;
    const exp = Math.min(streak - 1, 6);
    const delayMs = Math.min(
      STORAGE_PROVISION_RATE_LIMIT_DELAY_MS * 2 ** exp,
      STORAGE_PROVISION_RATE_LIMIT_DELAY_CAP_MS,
    );
    return {
      continue: true,
      delayMs,
      chain: input.chain + 1,
      rateLimitStreak: streak,
      deferred: false,
    };
  }
  return { continue: true, delayMs: 0, chain: input.chain + 1, rateLimitStreak: 0, deferred: false };
}
