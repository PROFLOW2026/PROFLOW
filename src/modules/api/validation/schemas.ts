import { z } from 'zod';

import { API_KEY_SCOPES } from '../domain/types';
import { WEBHOOK_EVENT_TYPES } from '../domain/webhook-events';
import { isWebhookEventId } from '../domain/webhook-envelope';
import { validateWebhookEndpointUrl } from '../domain/webhook-url';

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

export const rotateApiKeySchema = z.object({
  keyId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
});

export type RotateApiKeyInput = z.input<typeof rotateApiKeySchema>;

const webhookEventTypeSchema = z.enum(WEBHOOK_EVENT_TYPES);

export const registerWebhookSchema = z.object({
  url: z
    .string()
    .trim()
    .max(2000)
    .superRefine((value, ctx) => {
      const result = validateWebhookEndpointUrl(value);
      if (!result.ok) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `Unsafe or invalid webhook URL (${result.reason})`,
        });
      }
    }),
  eventTypes: z.array(webhookEventTypeSchema).min(1),
});

export type RegisterWebhookInput = z.input<typeof registerWebhookSchema>;

export const revokeWebhookSchema = z.object({
  endpointId: z.string().uuid(),
});

export type RevokeWebhookInput = z.input<typeof revokeWebhookSchema>;

export const rotateWebhookSecretSchema = z.object({
  endpointId: z.string().uuid(),
});

export type RotateWebhookSecretInput = z.input<typeof rotateWebhookSecretSchema>;

export const enqueueDeliverySchema = z.object({
  endpointId: z.string().uuid(),
  eventType: webhookEventTypeSchema,
  payload: z.record(z.string(), z.unknown()),
  eventId: z
    .string()
    .trim()
    .optional()
    .refine((value) => value === undefined || isWebhookEventId(value), {
      message: 'eventId must be a UUID',
    }),
});

export type EnqueueDeliveryInput = z.input<typeof enqueueDeliverySchema>;

export const recordDeliveryAttemptSchema = z.object({
  deliveryId: z.string().uuid(),
  outcome: z.enum(['success', 'failure']),
  httpStatus: z.number().int().min(100).max(599).optional().nullable(),
  error: z.string().trim().max(2000).optional().nullable(),
});

export type RecordDeliveryAttemptInput = z.input<typeof recordDeliveryAttemptSchema>;
