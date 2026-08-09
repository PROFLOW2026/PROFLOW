import { z } from 'zod';
import { CHANGE_DIRECTIONS } from '../domain/types';

const moneyAmountSchema = z
  .string()
  .trim()
  .regex(/^[+]?\d+(\.\d+)?$/, 'Amount must be a positive decimal')
  .optional()
  .nullable();

const businessDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional()
  .nullable();

export const createChangeRequestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(5000).optional().nullable(),
  direction: z.enum(CHANGE_DIRECTIONS).default('addition'),
  requestedAmount: moneyAmountSchema,
  requestedDate: businessDateSchema,
  notes: z.string().trim().max(5000).optional().nullable(),
});

export type CreateChangeRequestInput = z.infer<typeof createChangeRequestSchema>;

export const updateChangeRequestSchema = z.object({
  changeRequestId: z.string().uuid(),
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(5000).optional().nullable(),
  direction: z.enum(CHANGE_DIRECTIONS).optional(),
  requestedAmount: moneyAmountSchema,
  requestedDate: businessDateSchema,
  notes: z.string().trim().max(5000).optional().nullable(),
});

export type UpdateChangeRequestInput = z.infer<typeof updateChangeRequestSchema>;

export const changeRequestActionSchema = z.object({
  changeRequestId: z.string().uuid(),
  notes: z.string().trim().max(5000).optional().nullable(),
});

export const approveChangeRequestSchema = z.object({
  changeRequestId: z.string().uuid(),
  quoteVersionId: z.string().uuid().optional().nullable(),
  approverName: z.string().trim().max(200).optional().nullable(),
  notes: z.string().trim().max(5000).optional().nullable(),
  effectiveDate: businessDateSchema,
});

export type ApproveChangeRequestInput = z.infer<typeof approveChangeRequestSchema>;

const quoteLineSchema = z.object({
  description: z.string().trim().min(1).max(500),
  quantityEntered: z.string().trim().optional().nullable(),
  unitEntered: z.string().trim().max(50).optional().nullable(),
  unitPrice: moneyAmountSchema,
  lineTotal: z.string().trim().regex(/^[+]?\d+(\.\d+)?$/, 'Amount must be a positive decimal'),
});

export const createQuoteVersionSchema = z.object({
  changeRequestId: z.string().uuid(),
  lines: z.array(quoteLineSchema).min(1),
  taxAmount: moneyAmountSchema,
  validUntil: businessDateSchema,
  notes: z.string().trim().max(5000).optional().nullable(),
});

export type CreateQuoteVersionInput = z.infer<typeof createQuoteVersionSchema>;

export const issueQuoteVersionSchema = z.object({
  quoteVersionId: z.string().uuid(),
});

export const listChangesFilterSchema = z.object({
  status: z
    .enum(['all', 'draft', 'awaiting_approval', 'approved', 'rejected', 'cancelled'])
    .default('all'),
});

export type ListChangesFilterInput = z.infer<typeof listChangesFilterSchema>;
