import { z } from 'zod';
import {
  ESTIMATE_STATUSES,
  LEAD_STATUSES,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_STATUSES,
  PROSPECT_STATUSES,
  SALES_QUOTE_STATUSES,
} from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional());
const optionalEmail = z.preprocess(emptyToNull, z.string().trim().email().nullable().optional());
const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());
const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
);
/** Preserve omitted fields on partial update; empty string clears. */
const optionalInstant = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  if (value instanceof Date) return value;
  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed;
  }
  return value;
}, z.date().nullable().optional());
const optionalNextActionText = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  return value;
}, z.string().trim().max(2000).nullable().optional());
const moneyAmount = z
  .string()
  .trim()
  .regex(/^[+]?\d+(\.\d+)?$/, 'Amount must be a positive decimal');
const optionalMoney = z.preprocess(emptyToNull, moneyAmount.nullable().optional());
const currencyCode = z.string().trim().length(3);

export const createProspectSchema = z.object({
  name: z.string().trim().min(1).max(200),
  email: optionalEmail,
  phone: optionalText,
  companyName: optionalText,
  notes: optionalText,
});
export type CreateProspectInput = z.input<typeof createProspectSchema>;

export const updateProspectSchema = z.object({
  prospectId: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  status: z.enum(PROSPECT_STATUSES).optional(),
  email: optionalEmail,
  phone: optionalText,
  companyName: optionalText,
  notes: optionalText,
});
export type UpdateProspectInput = z.input<typeof updateProspectSchema>;

export const createProspectContactSchema = z.object({
  prospectId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  email: optionalEmail,
  phone: optionalText,
  role: optionalText,
});

export const createLeadSchema = z.object({
  title: z.string().trim().min(1).max(200),
  prospectId: optionalUuid,
  source: optionalText,
  email: optionalEmail,
  phone: optionalText,
  notes: optionalText,
});
export type CreateLeadInput = z.input<typeof createLeadSchema>;

export const updateLeadSchema = z.object({
  leadId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  prospectId: optionalUuid,
  source: optionalText,
  status: z.enum(LEAD_STATUSES).optional(),
  email: optionalEmail,
  phone: optionalText,
  notes: optionalText,
});
export type UpdateLeadInput = z.input<typeof updateLeadSchema>;

export const createOpportunitySchema = z.object({
  name: z.string().trim().min(1).max(200),
  prospectId: optionalUuid,
  leadId: optionalUuid,
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  expectedValueAmount: optionalMoney,
  currency: z.preprocess(emptyToNull, currencyCode.nullable().optional()),
  expectedStartDate: optionalDate,
  referralSource: optionalText,
  notes: optionalText,
  nextActionAt: optionalInstant,
  nextActionText: optionalNextActionText,
});
export type CreateOpportunityInput = z.input<typeof createOpportunitySchema>;

export const updateOpportunitySchema = z.object({
  opportunityId: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  prospectId: optionalUuid,
  leadId: optionalUuid,
  stage: z.enum(OPPORTUNITY_STAGES).optional(),
  status: z.enum(OPPORTUNITY_STATUSES).optional(),
  expectedValueAmount: optionalMoney,
  currency: z.preprocess(emptyToNull, currencyCode.nullable().optional()),
  expectedStartDate: optionalDate,
  referralSource: optionalText,
  lostReason: optionalText,
  notes: optionalText,
  nextActionAt: optionalInstant,
  nextActionText: optionalNextActionText,
});
export type UpdateOpportunityInput = z.input<typeof updateOpportunitySchema>;

export const createOpportunityNoteSchema = z.object({
  opportunityId: z.string().uuid(),
  body: z.string().trim().min(1).max(5000),
});
export type CreateOpportunityNoteInput = z.input<typeof createOpportunityNoteSchema>;

export const createEstimateSchema = z.object({
  opportunityId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  internalAmount: optionalMoney,
  currency: currencyCode.optional(),
  notes: optionalText,
  status: z.enum(ESTIMATE_STATUSES).optional(),
});
export type CreateEstimateInput = z.input<typeof createEstimateSchema>;

export const updateEstimateSchema = z.object({
  estimateId: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  internalAmount: optionalMoney,
  currency: currencyCode.optional(),
  notes: optionalText,
  status: z.enum(ESTIMATE_STATUSES).optional(),
});
export type UpdateEstimateInput = z.input<typeof updateEstimateSchema>;

const salesQuoteLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantity: z.preprocess(emptyToNull, moneyAmount.optional()).default('1'),
  unitAmount: moneyAmount,
  lineTotal: moneyAmount,
});

export const createSalesQuoteSchema = z.object({
  opportunityId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  currency: currencyCode.optional(),
  lines: z.array(salesQuoteLineSchema).min(1),
  taxAmount: optionalMoney,
  notes: optionalText,
  alternateLabel: optionalText,
});
export type CreateSalesQuoteInput = z.input<typeof createSalesQuoteSchema>;

export const createSalesQuoteVersionSchema = z.object({
  salesQuoteId: z.string().uuid(),
  lines: z.array(salesQuoteLineSchema).min(1),
  taxAmount: optionalMoney,
  notes: optionalText,
  alternateLabel: optionalText,
});
export type CreateSalesQuoteVersionInput = z.input<typeof createSalesQuoteVersionSchema>;

export const issueSalesQuoteVersionSchema = z.object({
  versionId: z.string().uuid(),
});

export const acceptSalesQuoteVersionSchema = z.object({
  versionId: z.string().uuid(),
});

export const convertWonOpportunitySchema = z.object({
  opportunityId: z.string().uuid(),
  /** Prefer a specific accepted version; otherwise the opportunity's accepted quote is used. */
  salesQuoteVersionId: optionalUuid,
  projectName: z.preprocess(emptyToNull, z.string().trim().min(1).max(200).nullable().optional()),
  amountIncludesTax: z.boolean().optional(),
});
export type ConvertWonOpportunityInput = z.input<typeof convertWonOpportunitySchema>;

export const listProspectsFilterSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum([...PROSPECT_STATUSES, 'all'] as const).optional(),
  includeArchived: z.boolean().optional(),
});

export const listLeadsFilterSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum([...LEAD_STATUSES, 'all'] as const).optional(),
  includeArchived: z.boolean().optional(),
});

export const listOpportunitiesFilterSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum([...OPPORTUNITY_STATUSES, 'all'] as const).optional(),
  stage: z.enum([...OPPORTUNITY_STAGES, 'all'] as const).optional(),
  includeArchived: z.boolean().optional(),
});

export const updateSalesQuoteSchema = z.object({
  salesQuoteId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  status: z.enum(SALES_QUOTE_STATUSES).optional(),
});
