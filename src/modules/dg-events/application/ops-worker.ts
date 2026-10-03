import 'server-only';

import { getAdminDb } from '@/shared/db/client';
import { countDeadLetteredDomainEvents } from '../data/events.repository';
import { runDgEventConsumer, type DgEventConsumerResult } from './consume';

export interface DgEventsOpsWorkerResult extends DgEventConsumerResult {
  /** All parked events (attempts exhausted), not only those parked in this run. */
  readonly deadLetterBacklog: number;
}

/**
 * Cron / operator path for the Developer-GC domain-event consumer (service role).
 * Wired from the request-driven kick and from /api/internal/ops-worker (daily safety net).
 * /api/internal/dg-events-worker stays callable; it is not a Vercel cron.
 */
export async function runDgEventsOpsWorker(options: { readonly maxMs?: number } = {}): Promise<DgEventsOpsWorkerResult> {
  const db = getAdminDb();
  const result = await runDgEventConsumer(db, { maxMs: options.maxMs ?? 20_000 });
  const deadLetterBacklog = await countDeadLetteredDomainEvents(db);
  return { ...result, deadLetterBacklog };
}
