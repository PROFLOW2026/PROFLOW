import { z } from 'zod';
import { DEFECT_SEVERITIES } from '@/modules/defects/domain/lifecycle';
import { CHECK_RESULTS, INSPECTION_OUTCOMES } from '../domain/rules';

const uuid = z.string().uuid();
const optionalUuid = uuid.nullish();
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const slug = z.string().regex(/^[a-z][a-z0-9_]*$/);
const optionalText = (maxLength: number) =>
  z
    .string()
    .trim()
    .max(maxLength)
    .nullish()
    .transform((value) => (value ? value : null));

export const templateRefSchema = z
  .string()
  .regex(/^(catalog:[a-z][a-z0-9_]*|custom:[0-9a-f-]{36})$/)
  .nullish();

export const createInspectionSchema = z.object({
  projectId: uuid,
  templateRef: templateRefSchema,
  title: z.string().trim().min(1).max(300),
  category: slug.nullish(),
  scheduledFor: isoDate.nullish(),
  locationId: optionalUuid,
  vendorId: optionalUuid,
  subcontractAgreementId: optionalUuid,
  workLineId: optionalUuid,
  workPackageId: optionalUuid,
  milestoneId: optionalUuid,
  inspectorUserId: optionalUuid,
  contractorVisible: z.boolean().default(true),
  /** Ad-hoc checklist items appended after the template items. */
  extraItems: z.array(z.string().trim().min(1).max(500)).max(100).default([]),
});
export type CreateInspectionInput = z.input<typeof createInspectionSchema>;

export const updateInspectionSchema = z.object({
  title: z.string().trim().min(1).max(300).optional(),
  scheduledFor: isoDate.nullish(),
  locationId: optionalUuid,
  vendorId: optionalUuid,
  subcontractAgreementId: optionalUuid,
  workLineId: optionalUuid,
  workPackageId: optionalUuid,
  milestoneId: optionalUuid,
  inspectorUserId: optionalUuid,
  contractorVisible: z.boolean().optional(),
});
export type UpdateInspectionInput = z.input<typeof updateInspectionSchema>;

export const checklistResultsSchema = z
  .array(
    z.object({
      itemId: uuid,
      result: z.enum(CHECK_RESULTS),
      note: optionalText(1000),
    }),
  )
  .max(300);
export type ChecklistResultsInput = z.input<typeof checklistResultsSchema>;

export const recordOutcomeSchema = z.object({
  results: checklistResultsSchema.default([]),
  outcome: z.enum(INSPECTION_OUTCOMES),
  summary: optionalText(5000),
  conditions: optionalText(5000),
  followUp: z
    .object({
      createDefects: z.boolean().default(false),
      defectSeverity: z.enum(DEFECT_SEVERITIES).default('medium'),
      defectDueDate: isoDate.nullish(),
      createTask: z.boolean().default(false),
      taskTitle: optionalText(300),
      taskDueDate: isoDate.nullish(),
    })
    .prefault({}),
});
export type RecordOutcomeInput = z.input<typeof recordOutcomeSchema>;

export const reinspectSchema = z.object({ scheduledFor: isoDate.nullish() });
export type ReinspectInput = z.input<typeof reinspectSchema>;

export const createTemplateSchema = z.object({
  /** null = organization-wide (project_team.admin). */
  projectId: optionalUuid,
  name: z.string().trim().min(1).max(200),
  category: slug.default('general'),
  description: optionalText(2000),
  items: z
    .array(z.object({ label: z.string().trim().min(1).max(500), isRequired: z.boolean().default(true) }))
    .min(1)
    .max(100),
});
export type CreateTemplateInput = z.input<typeof createTemplateSchema>;
