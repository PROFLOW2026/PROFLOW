import type { WebhookDeliveryStatus } from './types';

/** Max HTTP attempts before a delivery is abandoned (foundation contract). */
export const MAX_WEBHOOK_DELIVERY_ATTEMPTS = 5;

const TERMINAL: ReadonlySet<WebhookDeliveryStatus> = new Set(['delivered', 'abandoned']);

/**
 * Allowed status transitions for webhook deliveries.
 * `failed → pending` represents a scheduled retry; worker applies attempt bumps.
 */
const TRANSITIONS: Readonly<Record<WebhookDeliveryStatus, readonly WebhookDeliveryStatus[]>> = {
  pending: ['delivered', 'failed', 'abandoned'],
  failed: ['pending', 'delivered', 'abandoned'],
  delivered: [],
  abandoned: [],
};

export function isTerminalDeliveryStatus(status: WebhookDeliveryStatus): boolean {
  return TERMINAL.has(status);
}

export function canTransitionDeliveryStatus(
  from: WebhookDeliveryStatus,
  to: WebhookDeliveryStatus,
): boolean {
  if (from === to) return true;
  return TRANSITIONS[from].includes(to);
}

export function assertDeliveryStatusTransition(
  from: WebhookDeliveryStatus,
  to: WebhookDeliveryStatus,
): void {
  if (!canTransitionDeliveryStatus(from, to)) {
    throw new Error(`Invalid webhook delivery transition: ${from} → ${to}`);
  }
}

export interface DeliveryAttemptState {
  readonly status: WebhookDeliveryStatus;
  readonly attemptCount: number;
  readonly lastError: string | null;
  readonly deliveredAt: Date | null;
  /** HTTP response code when the peer answered; null if no response. */
  readonly lastHttpStatus: number | null;
}

/** Encodes HTTP status into lastError until a dedicated column ships (see 0015 proposal). */
export function formatDeliveryAttemptError(
  httpStatus: number | null | undefined,
  message?: string | null,
): string {
  const trimmed = message?.trim() || 'delivery_failed';
  if (httpStatus === null || httpStatus === undefined) return trimmed;
  if (!Number.isInteger(httpStatus) || httpStatus < 100 || httpStatus > 599) {
    return trimmed;
  }
  return `HTTP ${httpStatus}: ${trimmed}`;
}

export function parseDeliveryHttpStatus(lastError: string | null): number | null {
  if (!lastError) return null;
  const match = /^HTTP (\d{3}):/.exec(lastError);
  if (!match?.[1]) return null;
  const code = Number.parseInt(match[1], 10);
  return Number.isInteger(code) ? code : null;
}

/**
 * Pure retry-state update after one delivery attempt.
 * Does not perform HTTP - keeps attempt/status invariants correct for workers.
 */
export function applyDeliveryAttempt(
  current: DeliveryAttemptState,
  outcome: 'success' | 'failure',
  options?: { error?: string | null; httpStatus?: number | null; now?: Date },
): DeliveryAttemptState {
  if (isTerminalDeliveryStatus(current.status)) {
    throw new Error(`Cannot attempt terminal delivery in status ${current.status}`);
  }

  const now = options?.now ?? new Date();
  const attemptCount = current.attemptCount + 1;
  const httpStatus =
    options?.httpStatus === undefined ? null : options.httpStatus;

  if (outcome === 'success') {
    assertDeliveryStatusTransition(current.status, 'delivered');
    return {
      status: 'delivered',
      attemptCount,
      lastError: null,
      deliveredAt: now,
      lastHttpStatus: httpStatus ?? 200,
    };
  }

  const lastError = formatDeliveryAttemptError(httpStatus, options?.error);
  if (attemptCount >= MAX_WEBHOOK_DELIVERY_ATTEMPTS) {
    assertDeliveryStatusTransition(current.status, 'abandoned');
    return {
      status: 'abandoned',
      attemptCount,
      lastError,
      deliveredAt: null,
      lastHttpStatus: httpStatus,
    };
  }

  assertDeliveryStatusTransition(current.status, 'failed');
  return {
    status: 'failed',
    attemptCount,
    lastError,
    deliveredAt: null,
    lastHttpStatus: httpStatus,
  };
}

/** Schedules a retry by returning to pending without bumping attemptCount. */
export function scheduleDeliveryRetry(current: DeliveryAttemptState): DeliveryAttemptState {
  if (
    current.status === 'abandoned' ||
    current.attemptCount >= MAX_WEBHOOK_DELIVERY_ATTEMPTS
  ) {
    throw new Error('Delivery has exhausted retry budget');
  }
  if (current.status !== 'failed') {
    throw new Error(`Only failed deliveries can be retried (got ${current.status})`);
  }
  assertDeliveryStatusTransition(current.status, 'pending');
  return {
    ...current,
    status: 'pending',
  };
}

/** New rows start pending with zero attempts and no delivery timestamp. */
export function initialDeliveryState(): DeliveryAttemptState {
  return {
    status: 'pending',
    attemptCount: 0,
    lastError: null,
    deliveredAt: null,
    lastHttpStatus: null,
  };
}
