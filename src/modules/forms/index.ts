/** Public API of the field forms module (next-gen Agent 10). */
export {
  listFormTemplatesForOrg,
  getFormTemplateForOrg,
  createFormTemplate,
  updateFormTemplate,
  archiveFormTemplate,
} from './application/manage-templates';
export {
  listFormSubmissionsForOrg,
  listFormSubmissionsForOwner,
  getFormSubmissionForOrg,
  createFormSubmission,
  updateFormSubmissionDraft,
  submitFormSubmission,
  voidFormSubmission,
} from './application/manage-submissions';
export {
  assertFormOwnerExists,
  documentOwnerForFormOwner,
} from './application/assert-owner';

export {
  FORM_OWNER_TYPES,
  FORM_SUBMISSION_STATUSES,
  FORM_FIELD_TYPES,
  FORM_TEMPLATE_SCHEMA_VERSION,
} from './domain/types';
export type {
  FormOwnerType,
  FormSubmissionStatus,
  FormFieldType,
  FormFieldDefinition,
  FormChecklistItem,
  FormTemplateSchema,
  FormTemplateRecord,
  FormSubmissionRecord,
  FormSubmissionListItem,
  FormPhotoAnswer,
  FormChecklistAnswer,
} from './domain/types';

export {
  parseFormTemplateSchema,
  templateRequiresAcknowledgement,
  emptyAnswersForSchema,
} from './domain/schema';
export { normalizeFormAnswers } from './domain/answers';

export {
  createFormTemplateSchema,
  updateFormTemplateSchema,
  archiveFormTemplateSchema,
  createFormSubmissionSchema,
  updateFormSubmissionDraftSchema,
  submitFormSubmissionSchema,
  voidFormSubmissionSchema,
  listFormSubmissionsFilterSchema,
} from './validation/schemas';
export type {
  CreateFormTemplateInput,
  UpdateFormTemplateInput,
  ArchiveFormTemplateInput,
  CreateFormSubmissionInput,
  UpdateFormSubmissionDraftInput,
  SubmitFormSubmissionInput,
  VoidFormSubmissionInput,
  ListFormSubmissionsFilter,
} from './validation/schemas';
