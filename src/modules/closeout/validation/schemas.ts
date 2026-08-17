import { z } from 'zod';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const reasonSchema = z.preprocess(
  emptyToNull,
  z.string().trim().min(1, 'A reason is required').max(2000),
);

export const closeProjectSchema = z.object({
  projectId: z.string().uuid(),
  reason: reasonSchema,
});
export type CloseProjectInput = z.input<typeof closeProjectSchema>;

export const reopenProjectSchema = z.object({
  projectId: z.string().uuid(),
  reason: reasonSchema,
});
export type ReopenProjectInput = z.input<typeof reopenProjectSchema>;

export const markCloseoutReadySchema = z.object({
  projectId: z.string().uuid(),
});
export type MarkCloseoutReadyInput = z.input<typeof markCloseoutReadySchema>;

export const startCloseoutSchema = z.object({
  projectId: z.string().uuid(),
});
export type StartCloseoutInput = z.input<typeof startCloseoutSchema>;
