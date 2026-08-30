import type { ApOrgReadFactsBundle } from './ap-read-facts.types';

const apOrgFactsByTx = new WeakMap<object, ApOrgReadFactsBundle>();

export function seedApOrgReadFactsCache(db: object, facts: ApOrgReadFactsBundle): void {
  apOrgFactsByTx.set(db, facts);
}

export function getApOrgReadFactsCache(db: object): ApOrgReadFactsBundle | undefined {
  return apOrgFactsByTx.get(db);
}

export function clearApOrgReadFactsCache(db: object): void {
  apOrgFactsByTx.delete(db);
}
