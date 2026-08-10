import { z } from 'zod';
import { CLIENT_STATUSES, CONTACT_ROLES, IDENTIFIER_TYPES } from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional());

export const clientNameSchema = z
  .string()
  .trim()
  .min(1, 'Client name is required')
  .max(200, 'Client name must be at most 200 characters');

export const createClientSchema = z
  .object({
    name: clientNameSchema,
    legalName: optionalText,
    /** Company switchboard / office phone — not the contact person. */
    email: z.preprocess(emptyToNull, z.string().trim().email().nullable().optional()),
    phone: optionalText,
    website: optionalText,
    addressLine1: optionalText,
    addressLine2: optionalText,
    city: optionalText,
    region: optionalText,
    postalCode: optionalText,
    countryCode: z.preprocess(emptyToNull, z.string().trim().length(2).nullable().optional()),
    notes: optionalText,
    /** Primary contact person created in the same flow (optional group). */
    primaryContactName: z.preprocess(
      emptyToNull,
      z.string().trim().min(1).max(120).nullable().optional(),
    ),
    primaryContactPhone: optionalText,
    primaryContactEmail: z.preprocess(
      emptyToNull,
      z.string().trim().email().nullable().optional(),
    ),
    primaryContactRole: z.enum(CONTACT_ROLES).optional(),
  })
  .superRefine((value, ctx) => {
    const hasContactHint =
      Boolean(value.primaryContactName) ||
      Boolean(value.primaryContactPhone) ||
      Boolean(value.primaryContactEmail);

    if (!hasContactHint) return;

    if (!value.primaryContactName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['primaryContactName'],
        message: 'Contact person name is required',
      });
    }
    if (!value.primaryContactPhone) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['primaryContactPhone'],
        message: 'Contact person phone is required',
      });
    }
  });

export type CreateClientInput = z.input<typeof createClientSchema>;

export const updateClientSchema = z.object({
  clientId: z.string().uuid(),
  name: clientNameSchema.optional(),
  status: z.enum(CLIENT_STATUSES).optional(),
  legalName: optionalText,
  email: z.preprocess(emptyToNull, z.string().trim().email().nullable().optional()),
  phone: optionalText,
  website: optionalText,
  addressLine1: optionalText,
  addressLine2: optionalText,
  city: optionalText,
  region: optionalText,
  postalCode: optionalText,
  countryCode: z.preprocess(emptyToNull, z.string().trim().length(2).nullable().optional()),
  notes: optionalText,
});

export type UpdateClientInput = z.input<typeof updateClientSchema>;

export const archiveClientSchema = z.object({
  clientId: z.string().uuid(),
});

export const restoreClientSchema = archiveClientSchema;

export const listClientsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum([...CLIENT_STATUSES, 'all'] as const).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const createContactSchema = z.object({
  clientId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  role: z.enum(CONTACT_ROLES).optional(),
  email: z.preprocess(emptyToNull, z.string().trim().email().nullable().optional()),
  phone: optionalText,
  notes: optionalText,
});

export const updateContactSchema = z.object({
  contactId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  role: z.enum(CONTACT_ROLES).optional(),
  email: z.preprocess(emptyToNull, z.string().trim().email().nullable().optional()),
  phone: optionalText,
  notes: optionalText,
});

export const deleteContactSchema = z.object({
  contactId: z.string().uuid(),
});

export const markContactPrimarySchema = z.object({
  contactId: z.string().uuid(),
});

export const upsertIdentifierSchema = z.object({
  clientId: z.string().uuid(),
  type: z.enum(IDENTIFIER_TYPES),
  value: z.string().trim().min(1).max(120),
});

export const deleteIdentifierSchema = z.object({
  identifierId: z.string().uuid(),
});
