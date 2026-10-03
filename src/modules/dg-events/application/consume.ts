import type { NotificationCopyTranslator } from '@/modules/notifications/domain/copy';
import type { DbExecutor } from '@/shared/db/types';
import { resolveEntityScope } from '@/shared/entity-access';
import { createNotificationsCopyTranslator } from '@/shared/i18n/namespace-translator';
import { describeConsumerError, isDeadLettered, nextAttemptAt } from '../domain/backoff';
import {
  claimDueDomainEvents,
  markDomainEventFailed,
  markDomainEventProcessed,
} from '../data/events.repository';
import { defaultDgEventHandlers, type DgEventHandlerRegistry } from './registry';
import type { DgHandlerDeps } from './spec-handler';

export interface RunDgEventConsumerOptions {
  readonly batchSize?: number;
  readonly maxBatches?: number;
  /** Wall-clock budget; the current batch always finishes. */
  readonly maxMs?: number;
  readonly now?: () => Date;
  readonly registry?: DgEventHandlerRegistry;
  readonly resolveScope?: DgHandlerDeps['resolveScope'];
  readonly translator?: DgHandlerDeps['translator'];
}

export interface DgEventConsumerFailure {
  readonly eventId: string;
  readonly eventType: string;
  readonly attempts: number;
  readonly error: string;
}

export interface DgEventConsumerResult {
  readonly claimed: number;
  readonly processed: number;
  /** Processed without side effects (no handler registered for the type). */
  readonly ignored: number;
  readonly failed: number;
  /** Failed for the last allowed time in this run (parked until an operator intervenes). */
  readonly deadLettered: number;
  readonly internalNotifications: number;
  readonly externalNotifications: number;
  readonly resolved: number;
  readonly failures: readonly DgEventConsumerFailure[];
}

const DEFAULT_BATCH_SIZE = 50;
const DEFAULT_MAX_BATCHES = 20;
const MAX_REPORTED_FAILURES = 20;

/**
 * Idempotent service-role consumer of `domain_events`.
 *
 * Each batch runs in one transaction that row-locks due events (`SKIP LOCKED`, safe with
 * concurrent workers). Each event runs in its own savepoint together with `processed_at`, so an
 * event's notifications and its processed mark commit or roll back as one unit; a failing event
 * only increments `attempts`, stores `last_error` and schedules a backoff retry.
 */
export async function runDgEventConsumer(
  db: DbExecutor,
  options: RunDgEventConsumerOptions = {},
): Promise<DgEventConsumerResult> {
  const batchSize = Math.min(Math.max(options.batchSize ?? DEFAULT_BATCH_SIZE, 1), 500);
  const maxBatches = Math.max(options.maxBatches ?? DEFAULT_MAX_BATCHES, 1);
  const clock = options.now ?? (() => new Date());
  const registry = options.registry ?? defaultDgEventHandlers;
  const started = Date.now();

  const translators = new Map<string, Promise<NotificationCopyTranslator>>();
  const cachedTranslator = (locale: string) => {
    let pending = translators.get(locale);
    if (!pending) {
      pending = createNotificationsCopyTranslator(locale);
      translators.set(locale, pending);
    }
    return pending;
  };
  const translator = options.translator ?? cachedTranslator;
  const resolveScope = options.resolveScope ?? resolveEntityScope;

  const totals = {
    claimed: 0,
    processed: 0,
    ignored: 0,
    failed: 0,
    deadLettered: 0,
    internalNotifications: 0,
    externalNotifications: 0,
    resolved: 0,
  };
  const failures: DgEventConsumerFailure[] = [];

  for (let batch = 0; batch < maxBatches; batch += 1) {
    const now = clock();
    const deps: DgHandlerDeps = { now, translator, resolveScope };
    const claimed = await db.transaction(async (tx) => {
      const events = await claimDueDomainEvents(tx, { limit: batchSize, now });
      for (const event of events) {
        const handler = registry.get(event.eventType);
        try {
          const result = await tx.transaction(async (savepoint) => {
            const outcome = handler ? await handler(savepoint, event, deps) : null;
            await markDomainEventProcessed(savepoint, event.id, now);
            return outcome;
          });
          totals.processed += 1;
          if (!result) {
            totals.ignored += 1;
          } else {
            totals.internalNotifications += result.internalRecipients;
            totals.externalNotifications += result.externalRecipients;
            totals.resolved += result.resolved;
          }
        } catch (error) {
          const attempts = event.attempts + 1;
          const message = describeConsumerError(error);
          await markDomainEventFailed(tx, {
            event,
            attempts,
            error: message,
            now,
            nextAttemptAt: nextAttemptAt(attempts, now),
          });
          totals.failed += 1;
          if (isDeadLettered(attempts)) totals.deadLettered += 1;
          if (failures.length < MAX_REPORTED_FAILURES) {
            failures.push({ eventId: event.id, eventType: event.eventType, attempts, error: message });
          }
        }
      }
      return events.length;
    });
    totals.claimed += claimed;
    if (claimed < batchSize) break;
    if (options.maxMs !== undefined && Date.now() - started >= options.maxMs) break;
  }

  return { ...totals, failures };
}
