import { z } from 'zod';
import { CUSTOMER_PORTAL_SCOPES } from '../domain/types';

export const createCustomerGrantSchema = z
  .object({
    email: z.string().trim().email().max(320),
    displayName: z.string().trim().max(120).optional().nullable(),
    clientId: z.string().uuid().optional().nullable(),
    projectId: z.string().uuid().optional().nullable(),
    scopes: z
      .array(z.enum(CUSTOMER_PORTAL_SCOPES))
      .min(1)
      .default(['project.summary']),
    expiresAt: z.string().datetime().optional().nullable(),
  })
  .superRefine((data, ctx) => {
    if (!data.clientId && !data.projectId) {
      ctx.addIssue({
        code: 'custom',
        path: ['clientId'],
        message: 'At least one of clientId or projectId is required',
      });
    }
  });

export type CreateCustomerGrantInput = z.input<typeof createCustomerGrantSchema>;

export const revokeGrantSchema = z.object({
  grantId: z.string().uuid(),
});

export type RevokeGrantInput = z.input<typeof revokeGrantSchema>;

export const customerProjectSummarySchema = z.object({
  projectId: z.string().uuid(),
  grantId: z.string().uuid().optional(),
  scopes: z.array(z.enum(CUSTOMER_PORTAL_SCOPES)).optional(),
});

export type CustomerProjectSummaryInput = z.input<typeof customerProjectSummarySchema>;
