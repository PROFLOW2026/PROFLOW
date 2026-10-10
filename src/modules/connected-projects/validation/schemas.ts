import { z } from 'zod';

export const createInvitationSchema = z.object({
  projectId: z.string().uuid(),
  vendorId: z.string().uuid(),
  subcontractAgreementId: z.string().uuid(),
});

export const revokeInvitationSchema = z.object({
  projectId: z.string().uuid(),
  invitationId: z.string().uuid(),
});

export const connectionCodeSchema = z.object({
  code: z.string().trim().min(32).max(128),
});

export const acceptCodeSchema = connectionCodeSchema.extend({
  projectName: z.string().trim().max(200).optional(),
  confirmOrganization: z
    .union([z.literal('true'), z.literal('on'), z.literal('1'), z.boolean()])
    .optional()
    .transform((value) => value === true || value === 'true' || value === 'on' || value === '1'),
});

export function formToObject(formData: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value === 'string') out[key] = value;
  }
  return out;
}
