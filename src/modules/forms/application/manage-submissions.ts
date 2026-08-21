import { AUDIT_ACTIONS, recordAuditEvent } from '@/shared/audit';
import type { OrgContext } from '@/shared/auth/context';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertAnyPermission, assertPermission } from '@/shared/permissions/assert';
import { PERMISSIONS } from '@/shared/permissions/catalog';
import { noteModuleUsage } from '@/modules/tenancy';
import { normalizeFormAnswers } from '../domain/answers';
import { emptyAnswersForSchema, templateRequiresAcknowledgement } from '../domain/schema';
import type {
  FormOwnerType,
  FormSubmissionListItem,
  FormSubmissionRecord,
  FormSubmissionStatus,
} from '../domain/types';
import {
  findSubmissionById,
  findSubmissionByOfflineClientId,
  findTemplateById,
  insertSubmission,
  listSubmissions,
  updateSubmissionById,
} from '../data/forms.repository';
import { assertFormOwnerExists } from './assert-owner';
import {
  createFormSubmissionSchema,
  listFormSubmissionsFilterSchema,
  submitFormSubmissionSchema,
  updateFormSubmissionDraftSchema,
  voidFormSubmissionSchema,
  type CreateFormSubmissionInput,
  type ListFormSubmissionsFilter,
  type SubmitFormSubmissionInput,
  type UpdateFormSubmissionDraftInput,
  type VoidFormSubmissionInput,
} from '../validation/schemas';

const FORM_SUBMIT_OR_MANAGE = [PERMISSIONS.FORMS_SUBMIT, PERMISSIONS.FORMS_MANAGE] as const;

export async function listFormSubmissionsForOrg(
  context: OrgContext,
  rawFilters: ListFormSubmissionsFilter = {},
): Promise<FormSubmissionListItem[]> {
  assertPermission(context, PERMISSIONS.FORMS_READ);
  const parsed = listFormSubmissionsFilterSchema.safeParse(rawFilters);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }
  return listSubmissions(context.db, context.organizationId, parsed.data);
}

export async function listFormSubmissionsForOwner(
  context: OrgContext,
  ownerType: FormOwnerType,
  ownerId: string,
): Promise<FormSubmissionListItem[]> {
  return listFormSubmissionsForOrg(context, { ownerType, ownerId });
}

export async function getFormSubmissionForOrg(
  context: OrgContext,
  submissionId: string,
): Promise<FormSubmissionRecord> {
  assertPermission(context, PERMISSIONS.FORMS_READ);
  const submission = await findSubmissionById(context.db, context.organizationId, submissionId);
  if (!submission) throw new NotFoundError('Form submission');
  return submission;
}

export async function createFormSubmission(
  context: OrgContext,
  raw: CreateFormSubmissionInput,
): Promise<FormSubmissionRecord> {
  assertAnyPermission(context, FORM_SUBMIT_OR_MANAGE);
  const parsed = createFormSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const input = parsed.data;
  if (input.offlineClientId) {
    const existing = await findSubmissionByOfflineClientId(
      context.db,
      context.organizationId,
      input.offlineClientId,
    );
    if (existing) return existing;
  }

  const template = await findTemplateById(context.db, context.organizationId, input.templateId);
  if (!template || template.archivedAt || !template.enabled) {
    throw new NotFoundError('Form template');
  }

  await assertFormOwnerExists(context, input.ownerType, input.ownerId);

  const normalized = normalizeFormAnswers(
    template.schema,
    input.answers ?? emptyAnswersForSchema(template.schema),
    { requireComplete: false },
  );

  const submission = await insertSubmission(context.db, {
    organizationId: context.organizationId,
    templateId: template.id,
    ownerType: input.ownerType,
    ownerId: input.ownerId,
    status: 'draft',
    answers: normalized.answers,
    offlineClientId: input.offlineClientId ?? null,
    submittedByUserId: context.userId,
    submittedByEmployeeId: input.submittedByEmployeeId ?? null,
  });

  await noteModuleUsage(context.db, context.organizationId, 'forms');
  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.FORM_SUBMISSION_CREATED,
    entityType: 'form_submission',
    entityId: submission.id,
    after: {
      id: submission.id,
      templateId: submission.templateId,
      ownerType: submission.ownerType,
      ownerId: submission.ownerId,
      status: submission.status,
    },
  });
  return submission;
}

export async function updateFormSubmissionDraft(
  context: OrgContext,
  raw: UpdateFormSubmissionDraftInput,
): Promise<FormSubmissionRecord> {
  assertAnyPermission(context, FORM_SUBMIT_OR_MANAGE);
  const parsed = updateFormSubmissionDraftSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findSubmissionById(
    context.db,
    context.organizationId,
    parsed.data.submissionId,
  );
  if (!existing) throw new NotFoundError('Form submission');
  if (existing.status !== 'draft') {
    throw new DomainRuleError(
      'Only draft submissions can be edited.',
      'errors.validationFailed',
      { status: existing.status },
    );
  }

  const template = await findTemplateById(context.db, context.organizationId, existing.templateId);
  if (!template) throw new NotFoundError('Form template');

  const answersSource =
    parsed.data.answers !== undefined ? parsed.data.answers : existing.answers;
  const normalized = normalizeFormAnswers(template.schema, answersSource, {
    requireComplete: false,
  });

  const updated = await updateSubmissionById(
    context.db,
    context.organizationId,
    existing.id,
    {
      answers: normalized.answers,
      acknowledgementName:
        parsed.data.acknowledgementName !== undefined
          ? parsed.data.acknowledgementName
          : undefined,
      acknowledgementNote:
        parsed.data.acknowledgementNote !== undefined
          ? parsed.data.acknowledgementNote
          : undefined,
    },
  );
  if (!updated) throw new NotFoundError('Form submission');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.FORM_SUBMISSION_UPDATED,
    entityType: 'form_submission',
    entityId: updated.id,
    before: { id: existing.id, status: existing.status },
    after: { id: updated.id, status: updated.status },
  });
  return updated;
}

export async function submitFormSubmission(
  context: OrgContext,
  raw: SubmitFormSubmissionInput,
): Promise<FormSubmissionRecord> {
  assertAnyPermission(context, FORM_SUBMIT_OR_MANAGE);
  const parsed = submitFormSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findSubmissionById(
    context.db,
    context.organizationId,
    parsed.data.submissionId,
  );
  if (!existing) throw new NotFoundError('Form submission');
  if (existing.status === 'void') {
    throw new DomainRuleError('Voided submissions cannot be submitted.', 'errors.validationFailed');
  }
  if (existing.status === 'submitted') {
    return existing;
  }

  const template = await findTemplateById(context.db, context.organizationId, existing.templateId);
  if (!template) throw new NotFoundError('Form template');

  const answersSource =
    parsed.data.answers !== undefined ? parsed.data.answers : existing.answers;
  const normalized = normalizeFormAnswers(template.schema, answersSource, {
    requireComplete: true,
  });

  const needsAck = templateRequiresAcknowledgement(template.schema);
  const acknowledgementName =
    parsed.data.acknowledgementName?.trim() ||
    existing.acknowledgementName?.trim() ||
    null;

  if (needsAck && !acknowledgementName) {
    throw new DomainRuleError(
      'Acknowledgement name is required for this form.',
      'errors.validationFailed',
    );
  }

  const now = new Date();
  const updated = await updateSubmissionById(
    context.db,
    context.organizationId,
    existing.id,
    {
      status: 'submitted' satisfies FormSubmissionStatus,
      answers: normalized.answers,
      acknowledgementName: needsAck ? acknowledgementName : acknowledgementName,
      acknowledgementAt: needsAck ? now : existing.acknowledgementAt,
      acknowledgementNote:
        parsed.data.acknowledgementNote !== undefined
          ? parsed.data.acknowledgementNote
          : existing.acknowledgementNote,
      submittedByUserId: context.userId,
      submittedByEmployeeId:
        parsed.data.submittedByEmployeeId !== undefined
          ? parsed.data.submittedByEmployeeId
          : existing.submittedByEmployeeId,
      submittedAt: now,
    },
  );
  if (!updated) throw new NotFoundError('Form submission');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.FORM_SUBMISSION_SUBMITTED,
    entityType: 'form_submission',
    entityId: updated.id,
    before: { id: existing.id, status: existing.status },
    after: {
      id: updated.id,
      status: updated.status,
      acknowledgementName: updated.acknowledgementName,
      // Explicit: acknowledgement is NOT a legal e-signature.
      acknowledgementKind: 'acknowledgement_only',
    },
  });

  const { captureBrandSnapshot } = await import('@/modules/branding');
  await captureBrandSnapshot(context, {
    entityType: 'form_submission',
    entityId: updated.id,
  });

  return updated;
}

export async function voidFormSubmission(
  context: OrgContext,
  raw: VoidFormSubmissionInput,
): Promise<FormSubmissionRecord> {
  assertPermission(context, PERMISSIONS.FORMS_MANAGE);
  const parsed = voidFormSubmissionSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const existing = await findSubmissionById(
    context.db,
    context.organizationId,
    parsed.data.submissionId,
  );
  if (!existing) throw new NotFoundError('Form submission');
  if (existing.status === 'void') return existing;

  const updated = await updateSubmissionById(
    context.db,
    context.organizationId,
    existing.id,
    { status: 'void' },
  );
  if (!updated) throw new NotFoundError('Form submission');

  await recordAuditEvent(context, {
    action: AUDIT_ACTIONS.FORM_SUBMISSION_VOIDED,
    entityType: 'form_submission',
    entityId: updated.id,
    before: { id: existing.id, status: existing.status },
    after: { id: updated.id, status: updated.status },
  });
  return updated;
}
