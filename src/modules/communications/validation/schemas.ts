import { z } from 'zod';
import { COMMUNICATION_ENTITY_TYPES } from '../domain/types';

const emailSchema = z
  .string()
  .trim()
  .min(3)
  .max(320)
  .regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/, 'invalidEmail');

export const saveCommunicationDraftSchema = z.object({
  communicationId: z.string().uuid().optional(),
  relatedEntityType: z.enum(COMMUNICATION_ENTITY_TYPES).default('other'),
  relatedEntityId: z.string().uuid().nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  clientId: z.string().uuid().nullable().optional(),
  vendorId: z.string().uuid().nullable().optional(),
  recipientEmail: emailSchema,
  recipientName: z.string().trim().max(200).nullable().optional(),
  subject: z.string().trim().min(1).max(240),
  bodyText: z.string().trim().min(1).max(20_000),
  bodyHtml: z.string().trim().max(40_000).nullable().optional(),
  documentIds: z.array(z.string().uuid()).max(20).optional(),
});
export type SaveCommunicationDraftInput = z.infer<typeof saveCommunicationDraftSchema>;

export const communicationIdSchema = z.object({
  communicationId: z.string().uuid(),
});
export type CommunicationIdInput = z.infer<typeof communicationIdSchema>;

export const listCommunicationsSchema = z.object({
  status: z.enum(['draft', 'queued', 'sending', 'sent', 'failed', 'cancelled']).optional(),
  relatedEntityType: z.enum(COMMUNICATION_ENTITY_TYPES).optional(),
  relatedEntityId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  clientId: z.string().uuid().optional(),
  vendorId: z.string().uuid().optional(),
  limit: z.number().int().min(1).max(200).optional(),
});
export type ListCommunicationsInput = z.infer<typeof listCommunicationsSchema>;
