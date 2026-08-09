/**
 * API / webhook platform domain (doc 32).
 * No third-party adapters — foundation entities only.
 */

export const API_CLIENT_STATUSES = ['active', 'disabled'] as const;
export type ApiClientStatus = (typeof API_CLIENT_STATUSES)[number];

export const WEBHOOK_ENDPOINT_STATUSES = ['active', 'disabled'] as const;
export type WebhookEndpointStatus = (typeof WEBHOOK_ENDPOINT_STATUSES)[number];

export const WEBHOOK_DELIVERY_STATUSES = ['pending', 'delivered', 'failed', 'abandoned'] as const;
export type WebhookDeliveryStatus = (typeof WEBHOOK_DELIVERY_STATUSES)[number];

/** Foundation scopes — not fake third-party integrations. */
export const API_KEY_SCOPES = [
  'projects.read',
  'clients.read',
  'billing.read',
  'webhooks.manage',
] as const;

export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

export { WEBHOOK_EVENT_TYPES, type WebhookEventType } from './webhook-events';

export interface ApiClientRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly status: ApiClientStatus;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface ApiKeyRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly apiClientId: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly keyHash: string;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

/** Safe list projection — never includes keyHash. */
export interface ApiKeyListItem {
  readonly id: string;
  readonly organizationId: string;
  readonly apiClientId: string;
  readonly name: string;
  readonly keyPrefix: string;
  readonly scopes: readonly string[];
  readonly expiresAt: Date | null;
  readonly lastUsedAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WebhookEndpointRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly url: string;
  readonly secretHash: string;
  readonly eventTypes: readonly string[];
  readonly status: WebhookEndpointStatus;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WebhookEndpointListItem {
  readonly id: string;
  readonly organizationId: string;
  readonly url: string;
  readonly eventTypes: readonly string[];
  readonly status: WebhookEndpointStatus;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface WebhookDeliveryRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly endpointId: string;
  readonly eventType: string;
  readonly payload: unknown;
  readonly status: WebhookDeliveryStatus;
  readonly attemptCount: number;
  readonly lastError: string | null;
  /** Parsed from lastError (`HTTP NNN:`) until dedicated column exists. */
  readonly lastHttpStatus: number | null;
  readonly deliveredAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface AuthenticatedApiKey {
  readonly keyId: string;
  readonly apiClientId: string;
  readonly organizationId: string;
  readonly scopes: readonly string[];
  readonly clientName: string;
}
