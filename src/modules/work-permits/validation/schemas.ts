import { z } from 'zod';

const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullable()
  .optional();

export const createWorkPermitSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(500),
  permitType: z.string().trim().min(1).max(200),
  validFrom: optionalDate,
  validUntil: optionalDate,
  notes: z.string().trim().max(4000).nullable().optional(),
});

export type CreateWorkPermitInput = z.infer<typeof createWorkPermitSchema>;

export const workPermitMutationSchema = z.object({
  projectId: z.string().uuid(),
  workPermitId: z.string().uuid(),
});

export type WorkPermitMutationInput = z.infer<typeof workPermitMutationSchema>;
