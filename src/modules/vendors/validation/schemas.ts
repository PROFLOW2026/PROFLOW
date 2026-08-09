import { z } from 'zod';
import { CONTACT_ROLES, VENDOR_STATUSES, VENDOR_TYPES } from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional());

export const vendorNameSchema = z
  .string()
  .trim()
  .min(1, 'Vendor name is required')
  .max(200, 'Vendor name must be at most 200 characters');

export const createVendorSchema = z.object({
  name: vendorNameSchema,
  type: z.enum(VENDOR_TYPES).optional(),
  email: z.preprocess(emptyToNull, z.string().trim().email().nullable().optional()),
  phone: optionalText,
  website: optionalText,
  addressLine1: optionalText,
  city: optionalText,
  countryCode: z.preprocess(emptyToNull, z.string().trim().length(2).nullable().optional()),
  tier: optionalText,
  parentVendorId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  notes: optionalText,
});

export type CreateVendorInput = z.input<typeof createVendorSchema>;

export const updateVendorSchema = z.object({
  vendorId: z.string().uuid(),
  name: vendorNameSchema.optional(),
  type: z.enum(VENDOR_TYPES).optional(),
  status: z.enum(VENDOR_STATUSES).optional(),
  email: z.preprocess(emptyToNull, z.string().trim().email().nullable().optional()),
  phone: optionalText,
  website: optionalText,
  addressLine1: optionalText,
  city: optionalText,
  countryCode: z.preprocess(emptyToNull, z.string().trim().length(2).nullable().optional()),
  tier: optionalText,
  parentVendorId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  notes: optionalText,
});

export type UpdateVendorInput = z.input<typeof updateVendorSchema>;

export const archiveVendorSchema = z.object({
  vendorId: z.string().uuid(),
});

export const listVendorsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum([...VENDOR_STATUSES, 'all'] as const).optional(),
  type: z.enum([...VENDOR_TYPES, 'all'] as const).optional(),
  includeArchived: z.boolean().optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const createContactSchema = z.object({
  vendorId: z.string().uuid(),
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

export const createEngagementSchema = z.object({
  vendorId: z.string().uuid(),
  projectId: z.string().uuid(),
  role: optionalText,
  notes: optionalText,
});

export const archiveEngagementSchema = z.object({
  engagementId: z.string().uuid(),
});

export const promoteVendorFromTransactionSchema = z.object({
  supplierName: vendorNameSchema,
  type: z.enum(VENDOR_TYPES).optional(),
  expenseId: z.string().uuid().optional(),
  linkToExisting: z.boolean().optional(),
});

export type PromoteVendorFromTransactionInput = z.input<typeof promoteVendorFromTransactionSchema>;
