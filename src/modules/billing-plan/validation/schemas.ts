import { z } from 'zod';

const moneyAmountSchema = z
  .string()
  .trim()
  .min(1, 'Amount is required')
  .regex(/^[+]?\d+(\.\d+)?$/, 'Amount must be a positive decimal');

const optionalMoneySchema = moneyAmountSchema.optional().nullable();

const percentSchema = z
  .string()
  .trim()
  .regex(/^[+]?\d+(\.\d+)?$/, 'Percent must be a positive decimal');

const optionalPercentSchema = percentSchema.optional().nullable();

const currencySchema = z
  .string()
  .trim()
  .length(3, 'Currency must be a 3-letter ISO code')
  .transform((value) => value.toUpperCase());

const businessDateSchema = z
  .string()
  .trim()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD');

const lineKindSchema = z.enum([
  'fixed_amount',
  'percent_of_contract',
  'percent_of_base',
  'milestone',
  'period',
  'boq_link',
  'manual',
]);

const documentKindSchema = z.enum(['progress_account', 'partial_account', 'payment_request']);

const workKindSchema = z.enum([
  'contractor',
  'electrical',
  'plumbing',
  'hvac',
  'renovation',
  'small_works',
  'service_install',
  'architecture',
  'design',
  'engineering',
  'consulting',
  'inspection',
  'maintenance',
  'mixed',
]);

export const createPlanSchema = z.object({
  projectId: z.string().uuid(),
  contractId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  currency: currencySchema.optional(),
  defaultRetentionPercent: optionalPercentSchema,
  notes: z.string().trim().max(4000).optional().nullable(),
  templateId: z.string().uuid().optional().nullable(),
  professionTemplateKey: z.string().trim().max(80).optional().nullable(),
  activate: z.boolean().optional(),
});

export type CreatePlanInput = z.infer<typeof createPlanSchema>;

export const updatePlanSchema = z
  .object({
    planId: z.string().uuid(),
    name: z.string().trim().min(1).max(200).optional(),
    defaultRetentionPercent: optionalPercentSchema,
    notes: z.string().trim().max(4000).optional().nullable(),
    status: z.enum(['draft', 'active', 'completed', 'archived']).optional(),
  })
  .refine((value) => Object.keys(value).length > 1, {
    message: 'At least one field must be updated',
  });

export type UpdatePlanInput = z.infer<typeof updatePlanSchema>;

export const planIdSchema = z.object({
  planId: z.string().uuid(),
});

export const addPlanLineSchema = z.object({
  planId: z.string().uuid(),
  sectionId: z.string().uuid().optional().nullable(),
  label: z.string().trim().min(1).max(300),
  lineKind: lineKindSchema.default('manual'),
  agreedAmount: moneyAmountSchema.optional(),
  agreedPercent: optionalPercentSchema,
  targetDate: businessDateSchema.optional().nullable(),
  milestoneLabel: z.string().trim().max(200).optional().nullable(),
  retentionPercentOverride: optionalPercentSchema,
  boqNodeId: z.string().uuid().optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
});

export type AddPlanLineInput = z.infer<typeof addPlanLineSchema>;

export const updatePlanLineSchema = z.object({
  planId: z.string().uuid(),
  lineId: z.string().uuid(),
  label: z.string().trim().min(1).max(300).optional(),
  agreedAmount: moneyAmountSchema.optional(),
  agreedPercent: optionalPercentSchema,
  targetDate: businessDateSchema.optional().nullable(),
  milestoneLabel: z.string().trim().max(200).optional().nullable(),
  retentionPercentOverride: optionalPercentSchema,
  notes: z.string().trim().max(2000).optional().nullable(),
  sortOrder: z.number().int().min(0).optional(),
  sectionId: z.string().uuid().optional().nullable(),
});

export type UpdatePlanLineInput = z.infer<typeof updatePlanLineSchema>;

export const removePlanLineSchema = z.object({
  planId: z.string().uuid(),
  lineId: z.string().uuid(),
});

export const reorderPlanLinesSchema = z.object({
  planId: z.string().uuid(),
  orderedLineIds: z.array(z.string().uuid()).min(1),
});

export type ReorderPlanLinesInput = z.infer<typeof reorderPlanLinesSchema>;

export const duplicatePlanLineSchema = z.object({
  planId: z.string().uuid(),
  lineId: z.string().uuid(),
});

export const splitPlanLineSchema = z.object({
  planId: z.string().uuid(),
  lineId: z.string().uuid(),
  /** Percents of the original agreed amount that each new part receives; must total 100. */
  partPercents: z.array(percentSchema).min(2),
  labels: z.array(z.string().trim().min(1).max(300)).optional(),
});

export type SplitPlanLineInput = z.infer<typeof splitPlanLineSchema>;

export const createCycleSchema = z.object({
  planId: z.string().uuid(),
  title: z.string().trim().min(1).max(200),
  documentKind: documentKindSchema.optional(),
  accountDate: businessDateSchema,
  periodStart: businessDateSchema.optional().nullable(),
  periodEnd: businessDateSchema.optional().nullable(),
  retentionPercent: optionalPercentSchema,
  notes: z.string().trim().max(4000).optional().nullable(),
  /** When true, seed cycle lines from active plan lines with prior = billed to date. */
  seedFromPlan: z.boolean().optional(),
});

export type CreateCycleInput = z.infer<typeof createCycleSchema>;

export const updateCycleLineEntrySchema = z.object({
  cycleId: z.string().uuid(),
  planLineId: z.string().uuid(),
  currentPercent: optionalPercentSchema,
  currentAmount: optionalMoneySchema,
  lineNotes: z.string().trim().max(2000).optional().nullable(),
  closeRemainder: z.boolean().optional(),
});

export type UpdateCycleLineEntryInput = z.infer<typeof updateCycleLineEntrySchema>;

export const updateCycleLinesSchema = z.object({
  cycleId: z.string().uuid(),
  lines: z
    .array(
      z.object({
        planLineId: z.string().uuid(),
        currentPercent: optionalPercentSchema,
        currentAmount: optionalMoneySchema,
        lineNotes: z.string().trim().max(2000).optional().nullable(),
        closeRemainder: z.boolean().optional(),
      }),
    )
    .min(1),
});

export type UpdateCycleLinesInput = z.infer<typeof updateCycleLinesSchema>;

export const issueCycleSchema = z.object({
  cycleId: z.string().uuid(),
  issueDate: businessDateSchema.optional(),
  dueDate: businessDateSchema.optional().nullable(),
  reference: z.string().trim().max(120).optional().nullable(),
  notes: z.string().trim().max(4000).optional().nullable(),
  retentionAmount: optionalMoneySchema,
  retentionPercent: optionalPercentSchema,
  taxAmount: optionalMoneySchema,
  finalize: z.boolean().optional().default(true),
});

export type IssueCycleInput = z.infer<typeof issueCycleSchema>;

/** Alias — submit replaces issue naming. */
export const submitCycleSchema = issueCycleSchema;
export type SubmitCycleInput = IssueCycleInput;

export const approveCycleSchema = z.object({
  cycleId: z.string().uuid(),
  /** Approve all requested amounts when true or when lines omitted. */
  approveAllRequested: z.boolean().optional(),
  lines: z
    .array(
      z.object({
        planLineId: z.string().uuid(),
        approvedPercent: optionalPercentSchema,
        approvedAmount: optionalMoneySchema,
      }),
    )
    .optional(),
});

export type ApproveCycleInput = z.infer<typeof approveCycleSchema>;

export const cycleIdSchema = z.object({
  cycleId: z.string().uuid(),
});

export const applyTemplateSchema = z.object({
  planId: z.string().uuid(),
  templateId: z.string().uuid().optional(),
  professionTemplateKey: z.string().trim().max(80).optional(),
  /** Replace existing non-billed lines when true. */
  replaceExisting: z.boolean().optional(),
});

export type ApplyTemplateInput = z.infer<typeof applyTemplateSchema>;

export const saveOrgTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  workKind: workKindSchema.optional().nullable(),
  defaultRetentionPercent: optionalPercentSchema,
  currency: currencySchema.optional().nullable(),
  /** Copy rows from an existing plan. */
  sourcePlanId: z.string().uuid().optional(),
  rows: z
    .array(
      z.object({
        labelKey: z.string().trim().min(1).max(200).optional(),
        labelFallback: z.string().trim().min(1).max(300).optional(),
        lineKind: lineKindSchema,
        agreedPercent: optionalPercentSchema,
        agreedAmount: optionalMoneySchema,
        sortOrder: z.number().int().min(0),
        sectionKey: z.string().trim().max(80).optional().nullable(),
      }),
    )
    .optional(),
});

export type SaveOrgTemplateInput = z.infer<typeof saveOrgTemplateSchema>;

export const listPlansForProjectSchema = z.object({
  projectId: z.string().uuid(),
  contractId: z.string().uuid().optional(),
  includeArchived: z.boolean().optional(),
});

export type ListPlansForProjectInput = z.infer<typeof listPlansForProjectSchema>;
