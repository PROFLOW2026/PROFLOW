/**
 * Field forms / checklists / acknowledgement capture (next-gen forms module).
 * Signature = acknowledgement only — not legal e-signature compliance.
 */

export const FORM_OWNER_TYPES = [
  'project',
  'job',
  'work_order',
  'planning_task',
  'maintenance',
  'field_log',
] as const;
export type FormOwnerType = (typeof FORM_OWNER_TYPES)[number];

export const FORM_SUBMISSION_STATUSES = ['draft', 'submitted', 'void'] as const;
export type FormSubmissionStatus = (typeof FORM_SUBMISSION_STATUSES)[number];

export const FORM_FIELD_TYPES = [
  'checklist',
  'yes_no',
  'text',
  'number',
  'date',
  'photo',
  'notes',
  'signature',
] as const;
export type FormFieldType = (typeof FORM_FIELD_TYPES)[number];

export const FORM_TEMPLATE_SCHEMA_VERSION = 1 as const;

export interface FormChecklistItem {
  readonly key: string;
  readonly label: string;
}

export interface FormFieldDefinition {
  readonly key: string;
  readonly type: FormFieldType;
  readonly label: string;
  readonly required?: boolean;
  readonly helpText?: string | null;
  /** Checklist item rows (type === checklist). */
  readonly items?: readonly FormChecklistItem[];
}

export interface FormTemplateSchema {
  readonly version: typeof FORM_TEMPLATE_SCHEMA_VERSION;
  readonly fields: readonly FormFieldDefinition[];
}

export interface FormTemplateRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly name: string;
  readonly description: string | null;
  readonly category: string | null;
  readonly schema: FormTemplateSchema;
  readonly enabled: boolean;
  readonly archivedAt: Date | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FormSubmissionRecord {
  readonly id: string;
  readonly organizationId: string;
  readonly templateId: string;
  readonly ownerType: FormOwnerType;
  readonly ownerId: string;
  readonly status: FormSubmissionStatus;
  readonly answers: Record<string, unknown> | null;
  readonly acknowledgementName: string | null;
  readonly acknowledgementAt: Date | null;
  readonly acknowledgementNote: string | null;
  readonly submittedByUserId: string | null;
  readonly submittedByEmployeeId: string | null;
  readonly submittedAt: Date | null;
  readonly offlineClientId: string | null;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface FormSubmissionListItem extends FormSubmissionRecord {
  readonly templateName: string;
}

/** Photo field answer shape — document IDs via existing documents module. */
export interface FormPhotoAnswer {
  readonly documentIds: readonly string[];
}

/** Checklist answer: item key → checked. */
export type FormChecklistAnswer = Readonly<Record<string, boolean>>;
