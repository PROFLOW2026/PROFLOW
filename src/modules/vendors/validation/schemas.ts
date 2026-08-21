import { z } from 'zod';
import { isBusinessDate } from '@/shared/dates';
import {
  CONTACT_ROLES,
  ENGAGEMENT_STATUSES,
  VENDOR_IDENTIFIER_TYPES,
  VENDOR_STATUSES,
  VENDOR_TYPES,
} from '../domain/types';
import {
  SUBCONTRACT_CHANGE_DIRECTIONS,
  SUBCONTRACT_REQUIRED_DOC_TYPES,
  SUBCONTRACT_STATUSES,
} from '../domain/subcontract-types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional());

const businessDateSchema = z
  .string()
  .trim()
  .refine(isBusinessDate, { message: 'Invalid date' });

const optionalBusinessDate = z.preprocess(
  emptyToNull,
  businessDateSchema.nullable().optional(),
);

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
  defaultPaymentTermId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  categoryIds: z.array(z.string().uuid()).optional(),
  specialtyIds: z.array(z.string().uuid()).optional(),
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
  defaultPaymentTermId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  categoryIds: z.array(z.string().uuid()).optional(),
  specialtyIds: z.array(z.string().uuid()).optional(),
});

export type UpdateVendorInput = z.input<typeof updateVendorSchema>;

export const archiveVendorSchema = z.object({
  vendorId: z.string().uuid(),
});

export const restoreVendorSchema = archiveVendorSchema;

export const listVendorsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum([...VENDOR_STATUSES, 'all'] as const).optional(),
  type: z.enum([...VENDOR_TYPES, 'all'] as const).optional(),
  categoryId: z.string().uuid().optional(),
  includeArchived: z.boolean().optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const upsertVendorIdentifierSchema = z.object({
  vendorId: z.string().uuid(),
  type: z.enum(VENDOR_IDENTIFIER_TYPES),
  value: z.string().trim().min(1).max(120),
});

export const deleteVendorIdentifierSchema = z.object({
  identifierId: z.string().uuid(),
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

export const createEngagementSchema = z
  .object({
    vendorId: z.string().uuid(),
    projectId: z.string().uuid(),
    role: optionalText,
    notes: optionalText,
    startDate: optionalBusinessDate,
    endDate: optionalBusinessDate,
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be on or after start date',
      });
    }
  });

export type CreateEngagementInput = z.infer<typeof createEngagementSchema>;

export const endEngagementSchema = z.object({
  engagementId: z.string().uuid(),
  endDate: optionalBusinessDate,
});

export type EndEngagementInput = z.infer<typeof endEngagementSchema>;

export const cancelEngagementSchema = z.object({
  engagementId: z.string().uuid(),
  endDate: optionalBusinessDate,
});

export type CancelEngagementInput = z.infer<typeof cancelEngagementSchema>;

export const archiveEngagementSchema = z.object({
  engagementId: z.string().uuid(),
});

export const listEngagementsSchema = z.object({
  vendorId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: z.enum([...ENGAGEMENT_STATUSES, 'history', 'all'] as const).optional(),
});

export type ListEngagementsInput = z.infer<typeof listEngagementsSchema>;

export const promoteVendorFromTransactionSchema = z.object({
  supplierName: vendorNameSchema,
  type: z.enum(VENDOR_TYPES).optional(),
  expenseId: z.string().uuid().optional(),
  linkToExisting: z.boolean().optional(),
});

export type PromoteVendorFromTransactionInput = z.input<typeof promoteVendorFromTransactionSchema>;

const moneyAmountSchema = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Amount must be a non-negative decimal');

const optionalPercentSchema = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'Retention must be a non-negative percent')
    .nullable()
    .optional(),
);

export const createSubcontractSchema = z
  .object({
    title: z.string().trim().min(1).max(200),
    subcontractNumber: optionalText,
    vendorId: z.string().uuid(),
    projectId: z.string().uuid(),
    parentContractId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    originalAmount: moneyAmountSchema,
    retentionPercent: optionalPercentSchema,
    paymentTermId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    startDate: optionalBusinessDate,
    endDate: optionalBusinessDate,
    notes: optionalText,
    /**
     * When vendor.type is supplier, must be true to promote to both.
     * Never silent — callers must pass explicit confirmation.
     */
    promoteVendorToBoth: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be on or after start date',
      });
    }
  });

export type CreateSubcontractInput = z.infer<typeof createSubcontractSchema>;

export const listOrgSubcontractsSchema = z.object({
  vendorId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  status: z
    .enum(['draft', 'active', 'completed', 'cancelled', 'all'] as const)
    .optional(),
  limit: z.coerce.number().int().min(0).optional(),
});

export type ListOrgSubcontractsInput = z.input<typeof listOrgSubcontractsSchema>;

export const updateSubcontractSchema = z
  .object({
    subcontractId: z.string().uuid(),
    title: z.string().trim().min(1).max(200).optional(),
    subcontractNumber: optionalText,
    vendorId: z.string().uuid().optional(),
    projectId: z.string().uuid().optional(),
    parentContractId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    retentionPercent: optionalPercentSchema,
    startDate: optionalBusinessDate,
    endDate: optionalBusinessDate,
    notes: optionalText,
  })
  .superRefine((value, ctx) => {
    if (value.startDate && value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['endDate'],
        message: 'End date must be on or after start date',
      });
    }
  });

export type UpdateSubcontractInput = z.infer<typeof updateSubcontractSchema>;

export const changeSubcontractStatusSchema = z.object({
  subcontractId: z.string().uuid(),
  status: z.enum(SUBCONTRACT_STATUSES),
});

export type ChangeSubcontractStatusInput = z.infer<typeof changeSubcontractStatusSchema>;

export const addSubcontractValueChangeSchema = z.object({
  subcontractId: z.string().uuid(),
  kind: z.enum(['change_order', 'adjustment']),
  direction: z.enum(SUBCONTRACT_CHANGE_DIRECTIONS),
  amount: moneyAmountSchema,
  effectiveDate: optionalBusinessDate,
  reason: optionalText,
});

export type AddSubcontractValueChangeInput = z.infer<typeof addSubcontractValueChangeSchema>;

export const linkSubcontractDocumentSchema = z.object({
  subcontractId: z.string().uuid(),
  documentId: z.string().uuid(),
  isInsurance: z.coerce.boolean().optional(),
  isRequired: z.coerce.boolean().optional(),
  requiredType: z.enum(SUBCONTRACT_REQUIRED_DOC_TYPES).optional().nullable(),
  expiresAt: optionalBusinessDate,
  label: optionalText,
});

export type LinkSubcontractDocumentInput = z.infer<typeof linkSubcontractDocumentSchema>;
