import { z } from 'zod';
import { APPROVAL_ENTITY_TYPES, APPROVAL_STATUSES } from '../domain/types';
import { APPROVER_STRATEGIES } from '../domain/steps';

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

const approvalRuleStepInputSchema = z
  .object({
    stepOrder: z.number().int().min(1).optional(),
    name: z.string().trim().max(120).nullable().optional(),
    approverStrategy: z.enum(APPROVER_STRATEGIES),
    roleTemplateKey: z.enum(['owner', 'manager', 'finance', 'worker']).nullable().optional(),
    permissionKey: z.string().trim().min(1).max(120).nullable().optional(),
    userId: z.string().uuid().nullable().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.approverStrategy === 'role_template' && !value.roleTemplateKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['roleTemplateKey'],
        message: 'roleTemplateKey is required for role_template strategy',
      });
    }
    if (value.approverStrategy === 'permission' && !value.permissionKey) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['permissionKey'],
        message: 'permissionKey is required for permission strategy',
      });
    }
    if (value.approverStrategy === 'user' && !value.userId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['userId'],
        message: 'userId is required for user strategy',
      });
    }
  });

export const createApprovalRuleSchema = z.object({
  name: z.string().trim().min(2).max(120),
  entityType: entityTypeSchema,
  thresholdAmount: moneyStringSchema.nullable().optional(),
  currency: currencySchema.nullable().optional(),
  enabled: z.boolean().optional().default(true),
  /** Ordered steps. Empty / omitted = legacy single-step rule. */
  steps: z.array(approvalRuleStepInputSchema).max(20).optional(),
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

export const replaceApprovalRuleStepsSchema = z.object({
  ruleId: z.string().uuid(),
  steps: z.array(approvalRuleStepInputSchema).max(20),
});

export type ReplaceApprovalRuleStepsInput = z.input<typeof replaceApprovalRuleStepsSchema>;

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
