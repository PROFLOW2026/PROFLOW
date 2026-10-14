import { z } from 'zod';

export const prepareProjectCoverUploadSchema = z.object({
  projectId: z.string().uuid(),
  fileName: z.string().trim().min(1).max(200),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
});

export type PrepareProjectCoverUploadInput = z.input<typeof prepareProjectCoverUploadSchema>;

export const confirmProjectCoverUploadSchema = z.object({
  projectId: z.string().uuid(),
  storageKey: z.string().trim().min(1),
  mimeType: z.string().trim().min(1),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive().optional().nullable(),
  height: z.number().int().positive().optional().nullable(),
});

export type ConfirmProjectCoverUploadInput = z.input<typeof confirmProjectCoverUploadSchema>;

export const removeProjectCoverSchema = z.object({
  projectId: z.string().uuid(),
});

export type RemoveProjectCoverInput = z.input<typeof removeProjectCoverSchema>;
