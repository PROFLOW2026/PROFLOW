import { randomUUID } from 'node:crypto';

import type { WebhookEventType } from './webhook-events';

/**
 * Canonical outbound webhook body shape.
 * `eventId` is stable for idempotent enqueue and consumer dedupe.
 */
export interface WebhookEventEnvelope {
  readonly eventId: string;
  readonly eventType: WebhookEventType | string;
  readonly occurredAt: string;
  readonly data: Record<string, unknown>;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function createWebhookEventId(): string {
  return randomUUID();
}

export function isWebhookEventId(value: string): boolean {
  return UUID_RE.test(value);
}

export function buildWebhookEventEnvelope(input: {
  eventType: string;
  data: Record<string, unknown>;
  eventId?: string;
  occurredAt?: Date | string;
}): WebhookEventEnvelope {
  const eventId = input.eventId?.trim() || createWebhookEventId();
  if (!isWebhookEventId(eventId)) {
    throw new Error('Webhook eventId must be a UUID');
  }

  const occurredAt =
    typeof input.occurredAt === 'string'
      ? input.occurredAt
      : (input.occurredAt ?? new Date()).toISOString();

  return {
    eventId,
    eventType: input.eventType,
    occurredAt,
    data: input.data,
  };
}

export function extractWebhookEventId(payload: unknown): string | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const eventId = (payload as { eventId?: unknown }).eventId;
  if (typeof eventId !== 'string' || !isWebhookEventId(eventId)) return null;
  return eventId;
}

export function serializeWebhookEventBody(envelope: WebhookEventEnvelope): string {
  return JSON.stringify(envelope);
}
