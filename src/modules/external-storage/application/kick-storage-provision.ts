import 'server-only';

import { after } from 'next/server';

/** Starts one provision batch after the current request, then the worker chains the rest. */
export function kickStorageProvision(): void {
  if (process.env.VITEST === 'true' || process.env.NODE_ENV === 'test') return;
  try {
    after(() => {
      void import('./provision-batch')
        .then(({ runStorageProvisionCycle }) => runStorageProvisionCycle({ chain: 0 }))
        .catch(() => undefined);
    });
  } catch {
    // Outside a request. The daily ops worker still runs one cycle.
  }
}
