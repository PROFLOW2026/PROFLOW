import { z } from 'zod';
import { NOTIFICATION_EVENT_TYPES } from '../domain/types';

export const notificationIdSchema = z.object({
  notificationId: z.string().uuid(),
});
export type MarkNotificationReadInput = z.infer<typeof notificationIdSchema>;

export const listNotificationsSchema = z.object({
  limit: z.number().int().min(1).max(50).optional(),
});
export type ListNotificationsInput = z.infer<typeof listNotificationsSchema>;

export const runNotificationScanSchema = z.object({
  maxMs: z.number().int().min(200).max(15_000).optional(),
  perScannerCap: z.number().int().min(1).max(50).optional(),
});
export type RunNotificationScanInput = z.infer<typeof runNotificationScanSchema>;

export const emitNotificationSchema = z.object({
  recipientUserId: z.string().uuid(),
  type: z.enum(NOTIFICATION_EVENT_TYPES),
  title: z.string().trim().min(1).max(240),
  body: z.string().trim().min(1).max(2000),
  dedupeKey: z.string().trim().min(1).max(240),
  severity: z.enum(['info', 'warning', 'urgent']).optional(),
  entityType: z.string().trim().min(1).max(80).nullable().optional(),
  entityId: z.string().uuid().nullable().optional(),
  deepLink: z.string().trim().max(500).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  expiresAt: z.coerce.date().nullable().optional(),
});
export type EmitNotificationParsed = z.infer<typeof emitNotificationSchema>;
