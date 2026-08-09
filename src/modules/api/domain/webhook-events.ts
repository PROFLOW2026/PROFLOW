/**
 * Closed allowlist of webhook event types for the foundation surface.
 * Free-form / third-party event names are rejected at validation time.
 */
export const WEBHOOK_EVENT_TYPES = [
  'test.ping',
  'project.created',
  'project.updated',
  'client.updated',
  'billing.invoice.issued',
  'api.key.revoked',
] as const;

export type WebhookEventType = (typeof WEBHOOK_EVENT_TYPES)[number];

const ALLOWED = new Set<string>(WEBHOOK_EVENT_TYPES);

export function isAllowedWebhookEventType(value: string): value is WebhookEventType {
  return ALLOWED.has(value);
}

export function assertAllowedWebhookEventType(value: string): WebhookEventType {
  if (!isAllowedWebhookEventType(value)) {
    throw new Error(`Webhook event type not allowlisted: ${value}`);
  }
  return value;
}
