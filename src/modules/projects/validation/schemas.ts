import { z } from 'zod';
import { PROJECT_EXPERIENCE_PROFILE_KEYS } from '@/modules/tenancy/domain/project-profiles';
import {
  PROJECT_STATUSES,
  PROGRESS_STATUSES,
  MILESTONE_STATUSES,
  PRICING_MODES,
  WORK_KINDS,
  CONTRACT_STATUSES,
} from '../domain/types';
import { DATE_ORDER_MESSAGE, isEndBeforeStart } from '../domain/scheduling';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

/** Preserve undefined (omit) vs null (clear) for partial updates. */
const emptyStringOrNullToNull = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === '' || value === null) return null;
  return value;
};

const experienceProfileToNull = (value: unknown) => {
  if (value === undefined) return undefined;
  if (value === '' || value === null || value === 'auto') return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional());
const optionalDate = z.preprocess(
  emptyToNull,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
);
const optionalPercent = z.preprocess(emptyToNull, z
  .string()
  .trim()
  .regex(/^\d+(\.\d+)?$/)
  .refine((value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100;
  }, 'Progress must be between 0 and 100')
  .nullable()
  .optional());
const optionalProgressStatus = z.preprocess(
  emptyToNull,
  z.enum(PROGRESS_STATUSES).nullable().optional(),
);

function refineDateOrder<
  T extends {
    startDate?: string | null;
    targetEndDate?: string | null;
    endDate?: string | null;
    actualEndDate?: string | null;
  },
>(
  value: T,
  ctx: z.RefinementCtx,
  startKey: 'startDate',
  endKey: 'targetEndDate' | 'endDate' | 'actualEndDate',
) {
  const start = value[startKey];
  const end = value[endKey];
  if (isEndBeforeStart(start, end)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: DATE_ORDER_MESSAGE,
      path: [endKey],
    });
  }
}

export const projectNameSchema = z
  .string()
  .trim()
  .min(1, 'Project name is required')
  .max(200, 'Project name must be at most 200 characters');

const amountIncludesTaxSchema = z.preprocess((value) => {
  if (value === '' || value === null || value === undefined) return false;
  if (typeof value === 'boolean') return value;
  if (value === 'true' || value === 'including' || value === '1') return true;
  if (value === 'false' || value === 'excluding' || value === '0') return false;
  return value;
}, z.boolean());

const optionalMoneyAmount = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'Amount must be a non-negative number')
    .nullable()
    .optional(),
);

export const createProjectSchema = z
  .object({
    name: projectNameSchema,
    clientId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    primaryContactId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    clientName: z.preprocess(emptyToNull, z.string().trim().min(1).max(200).nullable().optional()),
    workKind: z.enum(WORK_KINDS).optional(),
    pricingMode: z.preprocess(emptyToNull, z.enum(PRICING_MODES).nullable().optional()),
    contractValueAmount: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
    contractValueCurrency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
    /** false = excluding VAT (לא כולל מע״מ); true = including VAT (כולל מע״מ). */
    amountIncludesTax: amountIncludesTaxSchema.optional(),
    /** Optional mid-project entry reduction (same tax mode as contract value). */
    openingReductionAmount: optionalMoneyAmount,
    domainName: z.preprocess(emptyToNull, z.string().trim().min(1).max(120).nullable().optional()),
    location: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
    description: optionalText,
    status: z.enum(PROJECT_STATUSES).optional(),
    projectRole: optionalText,
    deliveryMode: optionalText,
    startDate: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
    targetEndDate: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
    notes: optionalText,
  })
  .superRefine((value, ctx) => {
    refineDateOrder(value, ctx, 'startDate', 'targetEndDate');
    if (value.openingReductionAmount && !value.contractValueAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Opening reduction requires an original contract amount',
        path: ['openingReductionAmount'],
      });
    }
    if (value.primaryContactId && !value.clientId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Project contact requires a client',
        path: ['primaryContactId'],
      });
    }
  });

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type CreateProjectValues = z.output<typeof createProjectSchema>;

const jobNameSchema = z
  .string()
  .trim()
  .min(1, 'Job name is required')
  .max(200, 'Job name must be at most 200 characters');

/**
 * Quick job creation - client + name + pricing mode + start date required.
 * Fixed pricing requires an amount; open pricing forbids inventing a zero contract.
 */
export const createJobSchema = z
  .object({
    name: jobNameSchema,
    description: optionalText,
    clientId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    clientName: z.preprocess(emptyToNull, z.string().trim().min(1).max(200).nullable().optional()),
    pricingMode: z.enum(PRICING_MODES),
    priceAmount: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
    priceCurrency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
    amountIncludesTax: amountIncludesTaxSchema.optional(),
    startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Start date is required'),
    targetEndDate: optionalDate,
    notes: optionalText,
    /**
     * Formal crew via `employee_project_assignments` (Assignment ≠ Actual).
     * Unknown keys such as the old workersNote free-text are stripped.
     */
    employeeIds: z
      .preprocess((value) => {
        if (value == null || value === '') return [];
        const raw = Array.isArray(value) ? value : [value];
        const ids = raw.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        return [...new Set(ids)];
      }, z.array(z.string().uuid()).max(50))
      .optional()
      .default([]),
    status: z.enum(PROJECT_STATUSES).optional(),
  })
  .superRefine((value, ctx) => {
    refineDateOrder(value, ctx, 'startDate', 'targetEndDate');
    if (!value.clientId && !value.clientName) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Client is required',
        path: ['clientId'],
      });
    }
    if (value.pricingMode === 'fixed') {
      if (!value.priceAmount?.trim()) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Price is required for fixed pricing',
          path: ['priceAmount'],
        });
      }
    }
    if (value.pricingMode === 'open' && value.priceAmount?.trim()) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Open pricing cannot set a contract amount at create',
        path: ['priceAmount'],
      });
    }
  });

export type CreateJobInput = z.input<typeof createJobSchema>;
export type CreateJobValues = z.output<typeof createJobSchema>;

export const setJobFixedPriceSchema = z.object({
  jobId: z.string().uuid(),
  priceAmount: z.string().trim().min(1, 'Price is required'),
  priceCurrency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
  amountIncludesTax: amountIncludesTaxSchema.optional(),
});

export type SetJobFixedPriceInput = z.input<typeof setJobFixedPriceSchema>;

export const convertJobToProjectSchema = z.object({
  jobId: z.string().uuid(),
});

export type ConvertJobToProjectInput = z.input<typeof convertJobToProjectSchema>;

export const updateProjectSchema = z
  .object({
    projectId: z.string().uuid(),
    name: projectNameSchema.optional(),
    clientId: z.preprocess(emptyStringOrNullToNull, z.string().uuid().nullable().optional()),
    primaryContactId: z.preprocess(
      emptyStringOrNullToNull,
      z.string().uuid().nullable().optional(),
    ),
    location: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
    description: optionalText,
    status: z.enum(PROJECT_STATUSES).optional(),
    projectRole: optionalText,
    deliveryMode: optionalText,
    startDate: optionalDate,
    targetEndDate: optionalDate,
    actualEndDate: optionalDate,
    progressPercent: optionalPercent,
    progressStatus: optionalProgressStatus,
    notes: optionalText,
    experienceProfile: z.preprocess(
      experienceProfileToNull,
      z.enum(PROJECT_EXPERIENCE_PROFILE_KEYS).nullable().optional(),
    ),
    domainName: z.preprocess(emptyToNull, z.string().trim().min(1).max(120).nullable().optional()),
    contractValueAmount: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
    contractValueCurrency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
    amountIncludesTax: amountIncludesTaxSchema.optional(),
    openingReductionAmount: optionalMoneyAmount,
  })
  .superRefine((value, ctx) => {
    refineDateOrder(value, ctx, 'startDate', 'targetEndDate');
    if (isEndBeforeStart(value.startDate, value.actualEndDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: DATE_ORDER_MESSAGE,
        path: ['actualEndDate'],
      });
    }
    if (value.openingReductionAmount && !value.contractValueAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Opening reduction requires an original contract amount',
        path: ['openingReductionAmount'],
      });
    }
    if (value.primaryContactId && value.clientId === null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Project contact requires a client',
        path: ['primaryContactId'],
      });
    }
  });

export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const archiveProjectSchema = z.object({
  projectId: z.string().uuid(),
});

export const restoreProjectSchema = archiveProjectSchema;

export const listProjectsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum([...PROJECT_STATUSES, 'all'] as const).optional(),
  clientId: z.string().uuid().optional(),
  workKind: z.enum(WORK_KINDS).optional(),
  awaitingPayment: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  sortBy: z.enum(['name', 'status', 'created_at', 'updated_at']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
  limit: z.coerce.number().int().min(0).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const listJobsSchema = listProjectsSchema.omit({ workKind: true });

export const createWorkPackageSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: optionalText,
});

export const updateWorkPackageSchema = z
  .object({
    workPackageId: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    description: optionalText,
    startDate: optionalDate,
    endDate: optionalDate,
    progressPercent: optionalPercent,
  })
  .superRefine((value, ctx) => {
    if (isEndBeforeStart(value.startDate, value.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: DATE_ORDER_MESSAGE,
        path: ['endDate'],
      });
    }
  });

export const archiveWorkPackageSchema = z.object({
  workPackageId: z.string().uuid(),
});

export const createMilestoneSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(200),
  workPackageId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  targetDate: optionalDate,
  notes: optionalText,
});

export type CreateMilestoneInput = z.input<typeof createMilestoneSchema>;

export const updateMilestoneSchema = z.object({
  milestoneId: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  workPackageId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  targetDate: optionalDate,
  completedAt: optionalDate,
  status: z.enum(MILESTONE_STATUSES).optional(),
  notes: optionalText,
});

export type UpdateMilestoneInput = z.input<typeof updateMilestoneSchema>;

export const archiveMilestoneSchema = z.object({
  milestoneId: z.string().uuid(),
});

export const createPhaseSchema = z
  .object({
    workPackageId: z.string().uuid(),
    name: z.string().trim().min(1).max(120),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .superRefine((value, ctx) => {
    if (isEndBeforeStart(value.startDate, value.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: DATE_ORDER_MESSAGE,
        path: ['endDate'],
      });
    }
  });

export const updatePhaseSchema = z
  .object({
    phaseId: z.string().uuid(),
    name: z.string().trim().min(1).max(120).optional(),
    startDate: optionalDate,
    endDate: optionalDate,
  })
  .superRefine((value, ctx) => {
    if (isEndBeforeStart(value.startDate, value.endDate)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: DATE_ORDER_MESSAGE,
        path: ['endDate'],
      });
    }
  });

export const archivePhaseSchema = z.object({
  phaseId: z.string().uuid(),
});

export const splitProjectSchema = z.object({
  projectId: z.string().uuid(),
  defaultPackageName: z.string().trim().min(1).max(120).optional(),
  additionalPackages: z.array(z.string().trim().min(1).max(120)).min(1).optional(),
});

export const applyProjectTemplateSchema = z.object({
  projectId: z.string().uuid(),
  templateKey: z.enum([
    'simple_finish',
    'residential_mep',
    'design_studio',
    'main_contractor',
  ] as const),
});

const optionalRetentionPercent = z.preprocess(
  emptyToNull,
  z
    .string()
    .trim()
    .regex(/^\d+(\.\d+)?$/, 'Retention must be a non-negative number')
    .refine((value) => {
      const n = Number(value);
      return Number.isFinite(n) && n >= 0 && n <= 100;
    }, 'Retention must be between 0 and 100')
    .nullable()
    .optional(),
);

export const createAdditionalContractSchema = z
  .object({
    projectId: z.string().uuid(),
    name: z.preprocess(emptyToNull, z.string().trim().min(1).max(200).nullable().optional()),
    reference: z.preprocess(emptyToNull, z.string().trim().max(120).nullable().optional()),
    contractType: z.enum(['additional', 'secondary']).optional(),
    contractNumber: z.preprocess(emptyToNull, z.string().trim().max(80).nullable().optional()),
    clientId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    startDate: optionalDate,
    endDate: optionalDate,
    retentionPercent: optionalRetentionPercent,
    paymentTermId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
    notes: optionalText,
    enteredAmount: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
    currency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
    amountIncludesTax: amountIncludesTaxSchema.optional(),
    openingReductionAmount: optionalMoneyAmount,
    status: z.enum(CONTRACT_STATUSES).optional(),
  })
  .superRefine((value, ctx) => {
    refineDateOrder(value, ctx, 'startDate', 'endDate');
    if (value.openingReductionAmount && !value.enteredAmount) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Opening reduction requires an original contract amount',
        path: ['openingReductionAmount'],
      });
    }
  });

export type CreateAdditionalContractInput = z.input<typeof createAdditionalContractSchema>;

export const updateContractSchema = z
  .object({
    contractId: z.string().uuid(),
    name: z.preprocess(emptyStringOrNullToNull, z.string().trim().min(1).max(200).nullable().optional()),
    reference: z.preprocess(emptyStringOrNullToNull, z.string().trim().max(120).nullable().optional()),
    /** Primary is owned by `isPrimary` / set-primary - not this field. */
    contractType: z.enum(['additional', 'secondary']).optional(),
    contractNumber: z.preprocess(
      emptyStringOrNullToNull,
      z.string().trim().max(80).nullable().optional(),
    ),
    clientId: z.preprocess(emptyStringOrNullToNull, z.string().uuid().nullable().optional()),
    startDate: optionalDate,
    endDate: optionalDate,
    retentionPercent: optionalRetentionPercent,
    notes: optionalText,
    status: z.enum(CONTRACT_STATUSES).optional(),
    isPrimary: z.boolean().optional(),
  })
  .superRefine((value, ctx) => {
    refineDateOrder(value, ctx, 'startDate', 'endDate');
  });

export type UpdateContractInput = z.input<typeof updateContractSchema>;

export const listProjectContractsSchema = z.object({
  projectId: z.string().uuid(),
});

export const setPrimaryContractSchema = z.object({
  projectId: z.string().uuid(),
  contractId: z.preprocess(emptyToNull, z.string().uuid().nullable()),
});
