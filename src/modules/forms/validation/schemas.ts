import { z } from 'zod';
import { FORM_OWNER_TYPES, FORM_SUBMISSION_STATUSES } from '../domain/types';

const emptyToNull = (value: unknown) => {
  if (value === '' || value === null || value === undefined) return null;
  return value;
};

const optionalText = z.preprocess(emptyToNull, z.string().trim().max(4000).nullable().optional());
const optionalUuid = z.preprocess(emptyToNull, z.string().uuid().nullable().optional());

const checklistItemSchema = z.union([
  z.string().trim().min(1).max(200),
  z.object({
    key: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_]{0,63}$/),
    label: z.string().trim().min(1).max(200),
  }),
]);

export const formFieldInputSchema = z.object({
  key: z
    .string()
    .trim()
    .regex(/^[a-z][a-z0-9_]{0,63}$/, 'Key must be snake_case'),
  type: z.enum([
    'checklist',
    'yes_no',
    'text',
    'number',
    'date',
    'photo',
    'notes',
    'signature',
  ]),
  label: z.string().trim().min(1).max(200),
  required: z.boolean().optional().default(false),
  helpText: optionalText,
  items: z.array(checklistItemSchema).max(40).optional(),
});

export const formTemplateSchemaInput = z.object({
  version: z.literal(1).optional().default(1),
  fields: z.array(formFieldInputSchema).min(1).max(80),
});

export const createFormTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: optionalText,
  category: optionalText,
  schema: formTemplateSchemaInput,
  enabled: z.boolean().optional().default(true),
});

export type CreateFormTemplateInput = z.input<typeof createFormTemplateSchema>;

export const updateFormTemplateSchema = z.object({
  templateId: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  description: optionalText,
  category: optionalText,
  schema: formTemplateSchemaInput.optional(),
  enabled: z.boolean().optional(),
});

export type UpdateFormTemplateInput = z.input<typeof updateFormTemplateSchema>;

export const archiveFormTemplateSchema = z.object({
  templateId: z.string().uuid(),
});

export type ArchiveFormTemplateInput = z.input<typeof archiveFormTemplateSchema>;

export const createFormSubmissionSchema = z.object({
  templateId: z.string().uuid(),
  ownerType: z.enum(FORM_OWNER_TYPES),
  ownerId: z.string().uuid(),
  answers: z.record(z.string(), z.unknown()).optional().nullable(),
  offlineClientId: z.string().trim().min(1).max(120).optional().nullable(),
  submittedByEmployeeId: optionalUuid,
});

export type CreateFormSubmissionInput = z.input<typeof createFormSubmissionSchema>;

export const updateFormSubmissionDraftSchema = z.object({
  submissionId: z.string().uuid(),
  answers: z.record(z.string(), z.unknown()).optional().nullable(),
  acknowledgementName: optionalText,
  acknowledgementNote: optionalText,
});

export type UpdateFormSubmissionDraftInput = z.input<typeof updateFormSubmissionDraftSchema>;

export const submitFormSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
  answers: z.record(z.string(), z.unknown()).optional().nullable(),
  acknowledgementName: z.string().trim().min(1).max(200).optional().nullable(),
  acknowledgementNote: optionalText,
  submittedByEmployeeId: optionalUuid,
});

export type SubmitFormSubmissionInput = z.input<typeof submitFormSubmissionSchema>;

export const voidFormSubmissionSchema = z.object({
  submissionId: z.string().uuid(),
});

export type VoidFormSubmissionInput = z.input<typeof voidFormSubmissionSchema>;

export const listFormSubmissionsFilterSchema = z.object({
  ownerType: z.enum(FORM_OWNER_TYPES).optional(),
  ownerId: z.string().uuid().optional(),
  templateId: z.string().uuid().optional(),
  status: z.enum(FORM_SUBMISSION_STATUSES).optional(),
  limit: z.number().int().positive().max(500).optional(),
  offset: z.number().int().nonnegative().optional(),
});

export type ListFormSubmissionsFilter = z.input<typeof listFormSubmissionsFilterSchema>;
