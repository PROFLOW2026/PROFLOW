import 'server-only';
import { AsyncLocalStorage } from 'node:async_hooks';
import type { OrgAuthzSnapshot } from '@/shared/auth/org-authz-memo';
import type { Transaction } from '@/shared/db/types';

export type OrgRequestTxFrame = {
  readonly tx: Transaction;
  readonly snapshot: OrgAuthzSnapshot;
};

const orgRequestTx = new AsyncLocalStorage<OrgRequestTxFrame>();

export function getOrgRequestTxFrame(): OrgRequestTxFrame | undefined {
  return orgRequestTx.getStore();
}

export function runInOrgRequestTxFrame<T>(
  frame: OrgRequestTxFrame,
  fn: () => Promise<T>,
): Promise<T> {
  return orgRequestTx.run(frame, fn);
}
