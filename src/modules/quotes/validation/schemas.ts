import { z } from 'zod';
import {
  QUOTE_CONVERT_WORK_KINDS,
  QUOTE_STATUSES,
  QUOTE_TAX_MODES,
} from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());
const optionalText = z.preprocess(emptyToNull, z.string().trim().max(5000).nullable().optional());
const optionalDate = z.preprocess(
  emptyToNull,
  z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
);

const moneyAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Amount must be a non-negative number');

const optionalDiscountMoney = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  return value;
}, moneyAmount.nullable().optional());

const optionalDiscountPercent = z.preprocess((value) => {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  return value;
}, z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Percent must be a non-negative number')
  .refine((value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100;
  }, 'Percent must be between 0 and 100')
  .nullable()
  .optional());

const quantityAmount = z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/, 'Quantity must be a non-negative number')
  .refine((value) => Number(value) > 0, 'Quantity must be greater than zero');

export const quoteLineSchema = z.object({
  description: z.string().trim().min(1).max(2000),
  quantity: quantityAmount.default('1'),
  unit: z.preprocess(emptyToNull, z.string().trim().max(40).nullable().optional()),
  unitPriceAmount: moneyAmount,
  estimatedUnitCostAmount: z.preprocess(emptyToNull, moneyAmount.nullable().optional()),
  notes: optionalText,
});

export const createQuoteSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: optionalText,
  clientId: optionalUuid,
  contactId: optionalUuid,
  currency: z.string().trim().length(3).optional(),
  taxMode: z.enum(QUOTE_TAX_MODES).optional(),
  taxRuleId: optionalUuid,
  validityDate: optionalDate,
  notes: optionalText,
  reference: optionalText,
  discountAmount: optionalDiscountMoney,
  listSubtotalAmount: optionalDiscountMoney,
  discountPercent: optionalDiscountPercent,
  lines: z.array(quoteLineSchema).min(1, 'At least one line item is required'),
});

export type CreateQuoteInput = z.input<typeof createQuoteSchema>;

export const updateQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  description: optionalText,
  clientId: optionalUuid,
  contactId: optionalUuid,
  currency: z.string().trim().length(3).optional(),
  taxMode: z.enum(QUOTE_TAX_MODES).optional(),
  taxRuleId: optionalUuid,
  validityDate: optionalDate,
  notes: optionalText,
  discountAmount: optionalDiscountMoney,
  listSubtotalAmount: optionalDiscountMoney,
  discountPercent: optionalDiscountPercent,
  lines: z.array(quoteLineSchema).min(1).optional(),
});

export type UpdateQuoteInput = z.input<typeof updateQuoteSchema>;

export const transitionQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  toStatus: z.enum(QUOTE_STATUSES),
});

export type TransitionQuoteInput = z.input<typeof transitionQuoteSchema>;

export const convertQuoteSchema = z.object({
  quoteId: z.string().uuid(),
  workKind: z.enum(QUOTE_CONVERT_WORK_KINDS).default('project'),
  projectName: z.preprocess(emptyToNull, z.string().trim().min(1).max(200).nullable().optional()),
  /** When true, opening contract uses quote total as tax-inclusive entered amount. */
  amountIncludesTax: z.preprocess((value) => {
    if (value === '' || value === null || value === undefined) return false;
    if (typeof value === 'boolean') return value;
    if (value === 'true' || value === '1') return true;
    if (value === 'false' || value === '0') return false;
    return value;
  }, z.boolean()).optional(),
  /** Jobs only: open = no fake zero contract; fixed uses quote net. */
  pricingMode: z.preprocess(emptyToNull, z.enum(['fixed', 'open']).nullable().optional()),
});

export type ConvertQuoteInput = z.input<typeof convertQuoteSchema>;

export const listQuotesSchema = z.object({
  status: z.enum(QUOTE_STATUSES).optional(),
  clientId: z.string().uuid().optional(),
});

export type ListQuotesInput = z.input<typeof listQuotesSchema>;
