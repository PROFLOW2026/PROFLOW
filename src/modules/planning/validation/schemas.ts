import { z } from 'zod';
import { DATE_ORDER_MESSAGE, isEndBeforeStart, isIsoDate } from '../domain/dates';
import { PLANNING_DEPENDENCY_TYPES, PLANNING_WORK_ITEM_KINDS } from '../domain/types';

const optionalIsoDate = z
  .string()
  .trim()
  .optional()
  .nullable()
  .transform((v) => (v == null || v === '' ? null : v))
  .refine((v) => v == null || isIsoDate(v), { message: 'planning.validation.invalidDate' });

const optionalUuid = z
  .string()
  .uuid()
  .optional()
  .nullable()
  .transform((v) => v ?? null);

export const upsertPlanningWorkItemSchema = z
  .object({
    organizationId: z.string().uuid(),
    projectId: z.string().uuid(),
    workItemId: z.string().uuid().optional(),
    name: z.string().trim().min(1).max(200),
    kind: z.enum(PLANNING_WORK_ITEM_KINDS).default('task'),
    startDate: optionalIsoDate,
    targetEndDate: optionalIsoDate,
    actualEndDate: optionalIsoDate,
    progressPercent: z.coerce.number().min(0).max(100).default(0),
    phaseId: optionalUuid,
    workPackageId: optionalUuid,
    sortOrder: z.coerce.number().int().min(0).default(0),
  })
  .superRefine((data, ctx) => {
    if (isEndBeforeStart(data.startDate, data.targetEndDate)) {
      ctx.addIssue({
        code: 'custom',
        message: DATE_ORDER_MESSAGE,
        path: ['targetEndDate'],
      });
    }
    if (data.kind === 'milestone' && !data.targetEndDate && !data.startDate) {
      ctx.addIssue({
        code: 'custom',
        message: 'planning.validation.milestoneNeedsDate',
        path: ['targetEndDate'],
      });
    }
  });

export type UpsertPlanningWorkItemInput = z.infer<typeof upsertPlanningWorkItemSchema>;
/** Call-site payload before Zod defaults (progressPercent, sortOrder, etc.). */
export type UpsertPlanningWorkItemRawInput = z.input<typeof upsertPlanningWorkItemSchema>;

export const setPlanningDependencySchema = z
  .object({
    organizationId: z.string().uuid(),
    projectId: z.string().uuid(),
    predecessorId: z.string().uuid(),
    successorId: z.string().uuid(),
    type: z.enum(PLANNING_DEPENDENCY_TYPES).default('finish_to_start'),
  })
  .refine((d) => d.predecessorId !== d.successorId, {
    message: 'planning.dependency.self',
    path: ['successorId'],
  });

export type SetPlanningDependencyInput = z.infer<typeof setPlanningDependencySchema>;
export type SetPlanningDependencyRawInput = z.input<typeof setPlanningDependencySchema>;

export const removePlanningDependencySchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  dependencyId: z.string().uuid(),
});

export type RemovePlanningDependencyInput = z.infer<typeof removePlanningDependencySchema>;

export const listPlanningPlanSchema = z.object({
  organizationId: z.string().uuid(),
  projectId: z.string().uuid(),
  workKind: z.enum(['project', 'job']),
  today: z.string().refine(isIsoDate, { message: 'planning.validation.invalidDate' }),
});

export type ListPlanningPlanInput = z.infer<typeof listPlanningPlanSchema>;
