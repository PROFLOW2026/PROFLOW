import { z } from 'zod';
import type { ValidationIssue } from '@/shared/errors';
import { ValidationError } from '@/shared/errors';
import {
  PROJECT_RISK_SCALE_MAX,
  PROJECT_RISK_SCALE_MIN,
  PROJECT_RISK_STATUSES,
} from '../domain/constants';

const uuid = z.string().uuid();
const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .nullish()
  .transform((value) => (value ? value : null));
const scale = z.coerce
  .number()
  .int()
  .min(PROJECT_RISK_SCALE_MIN)
  .max(PROJECT_RISK_SCALE_MAX);
const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullish()
    .transform((value) => (value ? value : null));

export const createProjectRiskSchema = z.object({
  projectId: uuid,
  description: z.string().trim().min(1).max(5000),
  probability: scale,
  impact: scale,
  treatment: optionalText(5000),
  status: z.enum(PROJECT_RISK_STATUSES).default('open'),
  reviewOn: isoDate,
});
export type CreateProjectRiskParsed = z.output<typeof createProjectRiskSchema>;

export const updateProjectRiskStatusSchema = z.object({
  projectId: uuid,
  riskId: uuid,
  status: z.enum(PROJECT_RISK_STATUSES),
});
export type UpdateProjectRiskStatusParsed = z.output<typeof updateProjectRiskStatusSchema>;

function issuesFromZod(error: z.ZodError): ValidationIssue[] {
  return error.issues.map((issue) => ({
    path: issue.path.join('.'),
    message: issue.message,
  }));
}

export function parseCreateProjectRisk(input: unknown): CreateProjectRiskParsed {
  const parsed = createProjectRiskSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(issuesFromZod(parsed.error));
  return parsed.data;
}

export function parseUpdateProjectRiskStatus(input: unknown): UpdateProjectRiskStatusParsed {
  const parsed = updateProjectRiskStatusSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(issuesFromZod(parsed.error));
  return parsed.data;
}
