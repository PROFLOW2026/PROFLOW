import { z } from 'zod';
import type { ValidationIssue } from '@/shared/errors';
import { ValidationError } from '@/shared/errors';
import { DEFECT_MODES, DEFECT_SEVERITIES } from '../domain/lifecycle';

const uuid = z.string().uuid();
const optionalUuid = uuid.nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const text = (maxLength: number) => z.string().trim().max(maxLength);
const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullish()
    .transform((value) => (value ? value : null));
const slug = z.string().regex(/^[a-z][a-z0-9_]*$/);

export const createDefectSchema = z.object({
  projectId: uuid,
  title: text(300).min(1),
  description: optionalText(5000),
  severity: z.enum(DEFECT_SEVERITIES).default('medium'),
  category: slug.nullish(),
  dueDate: isoDate.nullish(),
  locationId: optionalUuid,
  vendorId: optionalUuid,
  subcontractAgreementId: optionalUuid,
  workLineId: optionalUuid,
  assigneeUserId: optionalUuid,
  inspectorUserId: optionalUuid,
  mode: z.enum(DEFECT_MODES).default('construction'),
  warrantySource: z.object({ type: slug, id: uuid }).nullish(),
  contractorVisible: z.boolean().default(true),
  sourceInspectionId: optionalUuid,
  sourceInspectionItemId: optionalUuid,
});
export type CreateDefectInput = z.input<typeof createDefectSchema>;

export const updateDefectSchema = z.object({
  title: text(300).min(1).optional(),
  description: optionalText(5000).optional(),
  severity: z.enum(DEFECT_SEVERITIES).optional(),
  category: slug.nullish(),
  dueDate: isoDate.nullish(),
  locationId: optionalUuid,
  inspectorUserId: optionalUuid,
  contractorVisible: z.boolean().optional(),
});
export type UpdateDefectInput = z.input<typeof updateDefectSchema>;

export const assignDefectSchema = z
  .object({
    vendorId: optionalUuid,
    subcontractAgreementId: optionalUuid,
    workLineId: optionalUuid,
    assigneeUserId: optionalUuid,
    dueDate: isoDate.nullish(),
    note: optionalText(2000),
  })
  .refine((value) => Boolean(value.vendorId || value.subcontractAgreementId || value.assigneeUserId), {
    message: 'A responsible contractor or person is required',
    path: ['vendorId'],
  });
export type AssignDefectInput = z.input<typeof assignDefectSchema>;

export const verifyDefectSchema = z
  .object({
    decision: z.enum(['accept', 'reject']),
    note: optionalText(2000),
    dueDate: isoDate.nullish(),
  })
  .refine((value) => value.decision === 'accept' || Boolean(value.note), {
    message: 'A rejection reason is required',
    path: ['note'],
  });
export type VerifyDefectInput = z.input<typeof verifyDefectSchema>;

export const noteSchema = z.object({ note: optionalText(2000), dueDate: isoDate.nullish() });
export type DefectNoteInput = z.input<typeof noteSchema>;

export const requiredNoteSchema = z.object({ note: text(2000).min(1), dueDate: isoDate.nullish() });

export function parseOrThrow<T extends z.ZodType>(schema: T, raw: unknown): z.output<T> {
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const issues: ValidationIssue[] = parsed.error.issues.map((issue) => ({
      path: issue.path.join('.'),
      message: issue.message,
    }));
    throw new ValidationError(issues);
  }
  return parsed.data;
}
