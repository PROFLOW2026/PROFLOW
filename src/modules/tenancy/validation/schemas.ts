import { z } from 'zod';
import { BUSINESS_PROFILE_KEYS } from '../domain/business-profiles';
import { PROFESSION_PRESET_KEYS } from '../domain/profession-presets';
import { OPTIONAL_MODULE_KEYS } from '../domain/types';
import { WORK_MIXES } from '../domain/work-mix';

/**
 * Server-authoritative validation (doc 67). The browser may run the same
 * schemas for instant feedback, but the server never trusts that it did.
 */

export const organizationNameSchema = z
  .string()
  .trim()
  .min(2, 'Organization name must be at least 2 characters')
  .max(120, 'Organization name must be at most 120 characters');

const optionalPresetToken = (value: unknown) =>
  value === '' || value === 'none' || value == null ? undefined : value;

const optionalModuleKeysFromForm = (value: unknown): string[] | undefined => {
  if (value == null || value === '') return undefined;
  if (Array.isArray(value)) {
    return value.map(String).map((item) => item.trim()).filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }
  return undefined;
};

export const createOrganizationSchema = z.object({
  name: organizationNameSchema,
  countryCode: z
    .string()
    .trim()
    .length(2)
    .transform((value) => value.toUpperCase())
    .default('IL'),
  baseCurrency: z
    .string()
    .trim()
    .length(3)
    .transform((value) => value.toUpperCase())
    .optional(),
  timezone: z.string().trim().min(1).optional(),
  defaultLocale: z.enum(['he-IL', 'en']).optional(),
  /** Preferred: business profile configuration preset (not a separate product). */
  businessProfile: z
    .preprocess(optionalPresetToken, z.enum(BUSINESS_PROFILE_KEYS).optional()),
  /** Legacy profession catalog seed - mapped to a business profile when present. */
  professionPreset: z
    .preprocess(optionalPresetToken, z.enum(PROFESSION_PRESET_KEYS).optional()),
  /** Explicit work-mix choice after org create - not a separate product. */
  workMix: z.preprocess(optionalPresetToken, z.enum(WORK_MIXES).optional()),
  /** Onboarding: replace locks to the recommendation; additive is safer for re-apply. */
  moduleMode: z.enum(['additive', 'replace']).optional(),
  /** Onboarding Q3 extras — enabled on top of the recommended profile. */
  extraModules: z.preprocess(
    optionalModuleKeysFromForm,
    z.array(z.enum(OPTIONAL_MODULE_KEYS)).optional(),
  ),
});

export type CreateOrganizationInput = z.input<typeof createOrganizationSchema>;
export type CreateOrganizationValues = z.output<typeof createOrganizationSchema>;

export const updateOrganizationSchema = z.object({
  name: organizationNameSchema.optional(),
  baseCurrency: z.string().trim().length(3).optional(),
  timezone: z.string().trim().min(1).optional(),
  countryCode: z.string().trim().length(2).optional(),
  defaultLocale: z.enum(['he-IL', 'en']).optional(),
  workWeekStartDay: z.coerce.number().int().min(0).max(6).optional(),
});

export const inviteMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email address'),
  roleKey: z.enum(['manager', 'finance', 'worker', 'owner']),
});

export type InviteMemberValues = z.output<typeof inviteMemberSchema>;

export const acceptInvitationSchema = z.object({
  token: z.string().trim().min(20),
});

export const setModuleVisibilitySchema = z.object({
  moduleKey: z.string().trim().min(1),
  enabled: z.boolean().nullable(),
});
