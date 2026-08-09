import { z } from 'zod';
import { API_KEY_SCOPES } from '../domain/types';

export const createApiClientSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export type CreateApiClientInput = z.input<typeof createApiClientSchema>;

export const createApiKeySchema = z.object({
  apiClientId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  scopes: z.array(z.enum(API_KEY_SCOPES)).min(1),
  expiresAt: z.string().datetime().optional().nullable(),
});

export type CreateApiKeyInput = z.input<typeof createApiKeySchema>;

export const revokeApiKeySchema = z.object({
  keyId: z.string().uuid(),
});

export type RevokeApiKeyInput = z.input<typeof revokeApiKeySchema>;

export const registerWebhookSchema = z.object({
  url: z.string().trim().url().max(2000),
  eventTypes: z.array(z.string().trim().min(1).max(120)).min(1),
});

export type RegisterWebhookInput = z.input<typeof registerWebhookSchema>;

export const enqueueDeliverySchema = z.object({
  endpointId: z.string().uuid(),
  eventType: z.string().trim().min(1).max(120),
  payload: z.record(z.string(), z.unknown()),
});

export type EnqueueDeliveryInput = z.input<typeof enqueueDeliverySchema>;
