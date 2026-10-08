import type { DbExecutor } from '@/shared/db/types';
import { getApOrgReadFactsCache, seedApOrgReadFactsCache } from '@/modules/ap';
import {
  loadFinancialsApOrgFactsBundle,
  loadFinancialsOrgPreflightBundle,
  type FinancialsApFactsBundle,
  type FinancialsOrgPreflightRow,
} from '../data/financials-read-bundle.repository';
import {
  noteFinancialsApOrgBundleLoad,
  noteFinancialsOrgPreflightLoad,
} from './financials-batch-load-metrics';

const orgPreflightByTx = new WeakMap<object, Promise<FinancialsOrgPreflightRow>>();

/** One org-wide preflight read per DB transaction (margin batch + multi-project pages). */
export function loadCachedFinancialsOrgPreflightBundle(
  db: DbExecutor,
  organizationId: string,
): Promise<FinancialsOrgPreflightRow> {
  const key = db as object;
  const hit = orgPreflightByTx.get(key);
  if (hit) return hit;

  noteFinancialsOrgPreflightLoad();
  const pending = loadFinancialsOrgPreflightBundle(db, organizationId);
  orgPreflightByTx.set(key, pending);
  return pending;
}

/** One org-wide AP facts JSON bundle per DB transaction; seeds AP read cache for GCM/AP folders. */
export async function loadCachedFinancialsApOrgFactsBundle(
  db: DbExecutor,
  organizationId: string,
): Promise<FinancialsApFactsBundle> {
  const cached = getApOrgReadFactsCache(db as object);
  if (cached) return cached;

  noteFinancialsApOrgBundleLoad();
  const facts = await loadFinancialsApOrgFactsBundle(db, organizationId);
  seedApOrgReadFactsCache(db as object, facts);
  return facts;
}
