import { z } from 'zod';

const uuid = z.string().uuid();
const optionalUuid = z
  .string()
  .optional()
  .transform((value) => (value && value.trim() ? value.trim() : null))
  .pipe(uuid.nullable());
const optionalText = (max: number) =>
  z
    .string()
    .max(max)
    .optional()
    .transform((value) => (value && value.trim() ? value.trim() : null));
const optionalDate = z
  .string()
  .optional()
  .transform((value, ctx) => {
    if (!value || !value.trim()) return null;
    const date = new Date(`${value.trim()}T23:59:59`);
    if (Number.isNaN(date.getTime())) {
      ctx.addIssue({ code: 'custom', message: 'invalid_date' });
      return z.NEVER;
    }
    return date;
  });

const grantFields = {
  projectId: uuid,
  vendorId: uuid,
  subcontractAgreementId: optionalUuid,
  allProjects: z
    .string()
    .optional()
    .transform((value) => value === 'on' || value === 'true'),
  template: z.string().min(1).max(40),
  capabilities: z.array(z.string().max(60)).max(64).default([]),
  expiresAt: optionalDate,
};

export const inviteContractorSchema = z.object({
  ...grantFields,
  displayName: z.string().trim().min(1).max(120),
  username: optionalText(32),
  contactEmail: optionalText(200).pipe(z.string().email().nullable()),
  phone: optionalText(40),
  locale: optionalText(10),
});

export const grantContractorSchema = z.object({ ...grantFields, principalId: uuid });

export const updateGrantSchema = z.object({
  projectId: uuid,
  grantId: uuid,
  template: z.string().min(1).max(40),
  capabilities: z.array(z.string().max(60)).max(64).default([]),
  expiresAt: optionalDate,
});

export const grantRefSchema = z.object({ projectId: uuid, grantId: uuid, reason: optionalText(500) });
export const principalRefSchema = z.object({ projectId: uuid, principalId: uuid });

export const signInSchema = z.object({
  username: z.string().trim().min(1).max(64),
  password: z.string().min(1).max(256),
});

export const tokenPasswordSchema = z.object({
  token: z.string().min(1).max(256),
  password: z.string().max(256),
  confirmation: z.string().max(256),
});

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(256),
  newPassword: z.string().max(256),
  confirmation: z.string().max(256),
});

export const profileSchema = z.object({
  displayName: z.string().trim().min(1).max(120),
  phone: optionalText(40),
  locale: z.string().min(2).max(10),
});

/** FormData -> plain object (repeated `capabilities` fields become an array). */
export function formToObject(formData: FormData): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of formData.entries()) {
    if (typeof value !== 'string') continue;
    if (key === 'capabilities') {
      const list = (result.capabilities as string[] | undefined) ?? [];
      list.push(value);
      result.capabilities = list;
    } else if (!key.startsWith('$ACTION')) {
      result[key] = value;
    }
  }
  return result;
}
