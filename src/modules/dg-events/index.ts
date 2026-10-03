/** Developer / GC domain-event consumers (notifications for internal users and contractor principals). */

export { runDgEventConsumer } from './application/consume';
export type {
  DgEventConsumerFailure,
  DgEventConsumerResult,
  RunDgEventConsumerOptions,
} from './application/consume';
export {
  createDgEventHandlerRegistry,
  defaultDgEventHandlers,
  registerDgEventHandler,
} from './application/registry';
export type { DgEventHandlerRegistry } from './application/registry';
export { createSpecHandler, dgDedupeKey } from './application/spec-handler';
export type { DgEventHandler, DgHandlerDeps } from './application/spec-handler';

export { DG_EVENT_SPECS, dgCopyKey, findDgEventSpec } from './domain/event-catalog';
export { DG_MAX_ATTEMPTS, retryDelayMs } from './domain/backoff';
export type {
  DgEventSpec,
  DgHandlerResult,
  DgNotificationCategory,
  DomainEventRecord,
} from './domain/types';
