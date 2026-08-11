import { z } from 'zod';
import { APPROVAL_ENTITY_TYPES, APPROVAL_STATUSES } from '../domain/types';

const entityTypeSchema = z.enum(APPROVAL_ENTITY_TYPES);
const statusSchema = z.enum(APPROVAL_STATUSES);

const moneyStringSchema = z
  .string()
  .trim()
  .regex(/^-?\d+(\.\d+)?$/, 'Invalid amount');

const currencySchema = z
  .string()
  .trim()
  .length(3)
  .transform((value) => value.toUpperCase());

export const createApprovalRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  entityType: entityTypeSchema,
  thresholdAmount: moneyStringSchema.nullable().optional(),
  currency: currencySchema.nullable().optional(),
  enabled: z.boolean().optional().default(true),
});

export type CreateApprovalRuleInput = z.input<typeof createApprovalRuleSchema>;

export const updateApprovalRuleSchema = z.object({
  ruleId: z.string().uuid(),
  name: z.string().trim().min(2).max(120).optional(),
  thresholdAmount: moneyStringSchema.nullable().optional(),
  currency: currencySchema.nullable().optional(),
  enabled: z.boolean().optional(),
});

export type UpdateApprovalRuleInput = z.input<typeof updateApprovalRuleSchema>;

export const submitApprovalRequestSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().uuid(),
  amount: moneyStringSchema.nullable().optional(),
  currency: currencySchema.nullable().optional(),
  /** When true, skip if no matching enabled rule (default). */
  requireMatchingRule: z.boolean().optional().default(true),
});

export type SubmitApprovalRequestInput = z.input<typeof submitApprovalRequestSchema>;

export const decideApprovalSchema = z.object({
  requestId: z.string().uuid(),
  decision: z.enum(['approved', 'rejected']),
  decisionNote: z.string().trim().max(2000).nullable().optional(),
});

export type DecideApprovalInput = z.input<typeof decideApprovalSchema>;

export const cancelApprovalSchema = z.object({
  requestId: z.string().uuid(),
  decisionNote: z.string().trim().max(2000).nullable().optional(),
});

export type CancelApprovalInput = z.input<typeof cancelApprovalSchema>;

export const listApprovalRequestsSchema = z.object({
  status: statusSchema.optional(),
  entityType: entityTypeSchema.optional(),
  limit: z.number().int().min(1).max(500).optional(),
});

export type ListApprovalRequestsInput = z.input<typeof listApprovalRequestsSchema>;

export const gateApprovalSchema = z.object({
  entityType: entityTypeSchema,
  entityId: z.string().uuid(),
  amount: moneyStringSchema.nullable().optional(),
  currency: currencySchema.nullable().optional(),
  /** Auto-create a submitted request when a rule matches and none exists. */
  submitIfMissing: z.boolean().optional().default(true),
});

export type GateApprovalInput = z.input<typeof gateApprovalSchema>;
