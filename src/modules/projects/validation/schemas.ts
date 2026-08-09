import { z } from 'zod';
import { PROJECT_STATUSES, PROGRESS_STATUSES, MILESTONE_STATUSES } from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(2000).nullable().optional());
const optionalDate = z.preprocess(
  emptyToNull,
  z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
);
const optionalPercent = z.preprocess(emptyToNull, z.string().trim().regex(/^\d+(\.\d+)?$/).nullable().optional());
const optionalProgressStatus = z.preprocess(
  emptyToNull,
  z.enum(PROGRESS_STATUSES).nullable().optional(),
);

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

export const createProjectSchema = z.object({
  name: projectNameSchema,
  clientId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
  clientName: z.preprocess(emptyToNull, z.string().trim().min(1).max(200).nullable().optional()),
  contractValueAmount: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
  contractValueCurrency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
  /** false = excluding VAT (לא כולל מע״מ); true = including VAT (כולל מע״מ). */
  amountIncludesTax: amountIncludesTaxSchema.optional(),
  domainName: z.preprocess(emptyToNull, z.string().trim().min(1).max(120).nullable().optional()),
  location: z.preprocess(emptyToNull, z.string().trim().max(500).nullable().optional()),
  description: optionalText,
  status: z.enum(PROJECT_STATUSES).optional(),
  projectRole: optionalText,
  deliveryMode: optionalText,
  startDate: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  targetEndDate: z.preprocess(emptyToNull, z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional()),
  notes: optionalText,
});

export type CreateProjectInput = z.input<typeof createProjectSchema>;
export type CreateProjectValues = z.output<typeof createProjectSchema>;

export const updateProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: projectNameSchema.optional(),
  clientId: z.preprocess(emptyToNull, z.string().uuid().nullable().optional()),
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
  domainName: z.preprocess(emptyToNull, z.string().trim().min(1).max(120).nullable().optional()),
  contractValueAmount: z.preprocess(emptyToNull, z.string().trim().nullable().optional()),
  contractValueCurrency: z.preprocess(emptyToNull, z.string().trim().length(3).nullable().optional()),
  amountIncludesTax: amountIncludesTaxSchema.optional(),
});

export type UpdateProjectInput = z.input<typeof updateProjectSchema>;

export const archiveProjectSchema = z.object({
  projectId: z.string().uuid(),
});

export const listProjectsSchema = z.object({
  search: z.string().trim().optional(),
  status: z.enum([...PROJECT_STATUSES, 'all'] as const).optional(),
  clientId: z.string().uuid().optional(),
  includeArchived: z.boolean().optional(),
  sortBy: z.enum(['name', 'status', 'created_at', 'updated_at']).optional(),
  sortDirection: z.enum(['asc', 'desc']).optional(),
});

export const createWorkPackageSchema = z.object({
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  description: optionalText,
});

export const updateWorkPackageSchema = z.object({
  workPackageId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  description: optionalText,
  startDate: optionalDate,
  endDate: optionalDate,
  progressPercent: optionalPercent,
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

export const createPhaseSchema = z.object({
  workPackageId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  startDate: optionalDate,
  endDate: optionalDate,
});

export const updatePhaseSchema = z.object({
  phaseId: z.string().uuid(),
  name: z.string().trim().min(1).max(120).optional(),
  startDate: optionalDate,
  endDate: optionalDate,
});

export const archivePhaseSchema = z.object({
  phaseId: z.string().uuid(),
});

export const splitProjectSchema = z.object({
  projectId: z.string().uuid(),
  defaultPackageName: z.string().trim().min(1).max(120).optional(),
  additionalPackages: z.array(z.string().trim().min(1).max(120)).min(1).optional(),
});
