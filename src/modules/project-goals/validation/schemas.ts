import { z } from 'zod';
import type { ValidationIssue } from '@/shared/errors';
import { ValidationError } from '@/shared/errors';
import {
  PROJECT_GOAL_PROGRESS_MAX,
  PROJECT_GOAL_PROGRESS_MIN,
  PROJECT_GOAL_STATUSES,
} from '../domain/constants';

const uuid = z.string().uuid();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .transform((value) => (value ? value : null));

const progress = z.coerce
  .number()
  .int()
  .min(PROJECT_GOAL_PROGRESS_MIN)
  .max(PROJECT_GOAL_PROGRESS_MAX);

export const createProjectGoalSchema = z.object({
  projectId: uuid,
  title: z.string().trim().min(1).max(500),
  dueOn: isoDate,
  status: z.enum(PROJECT_GOAL_STATUSES).default('not_started'),
  progressPercent: progress.default(PROJECT_GOAL_PROGRESS_MIN),
  ownerUserId: uuid.nullish().transform((value) => (value ? value : null)),
});
export type CreateProjectGoalParsed = z.output<typeof createProjectGoalSchema>;

export const updateProjectGoalStatusSchema = z.object({
  projectId: uuid,
  goalId: uuid,
  status: z.enum(PROJECT_GOAL_STATUSES),
});
export type UpdateProjectGoalStatusParsed = z.output<typeof updateProjectGoalStatusSchema>;

function issuesFromZod(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function parseCreateProjectGoal(input: unknown): CreateProjectGoalParsed {
  const parsed = createProjectGoalSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(issuesFromZod(parsed.error));
  return parsed.data;
}

export function parseUpdateProjectGoalStatus(input: unknown): UpdateProjectGoalStatusParsed {
  const parsed = updateProjectGoalStatusSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(issuesFromZod(parsed.error));
  return parsed.data;
}
