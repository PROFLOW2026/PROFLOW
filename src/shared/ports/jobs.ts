import 'server-only';
import { logger } from '@/shared/observability';

/**
 * Background work boundary (doc 71 §9).
 *
 * V1 has no queue infrastructure and does not need one. What it does need is a
 * seam, so that "recalculate this project's rollup" is written once and can
 * later move off the request path without touching call sites.
 */

export type JobName =
  | 'recalculate-project-financials'
  | 'recalculate-overhead-allocation'
  | 'send-invitation-email';

export interface JobPayload {
  organizationId: string;
  [key: string]: unknown;
}

export interface JobPort {
  enqueue(name: JobName, payload: JobPayload): Promise<void>;
}

type JobHandler = (payload: JobPayload) => Promise<void>;

const handlers = new Map<JobName, JobHandler>();

export function registerJobHandler(name: JobName, handler: JobHandler): void {
  handlers.set(name, handler);
}

/**
 * Runs the handler in the background of the current request.
 *
 * Failures are logged and swallowed on purpose: a rollup that could not be
 * refreshed must never roll back the user's write. The figure is recomputed on
 * next read anyway.
 *
 * Payloads are never logged — they may contain PII or financial identifiers.
 */
class InlineJobAdapter implements JobPort {
  async enqueue(name: JobName, payload: JobPayload): Promise<void> {
    const handler = handlers.get(name);
    if (!handler) return;

    try {
      await handler(payload);
    } catch (error) {
      logger.error('jobs.failed', {
        name,
        organizationId: payload.organizationId,
        error,
      });
    }
  }
}

let instance: JobPort | undefined;

export function getJobPort(): JobPort {
  instance ??= new InlineJobAdapter();
  return instance;
}

export function setJobPort(port: JobPort | undefined): void {
  instance = port;
}
