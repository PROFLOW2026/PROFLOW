'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  getFormSubmissionForOrg,
  getFormTemplateForOrg,
  submitFormSubmission,
  updateFormSubmissionDraft,
  voidFormSubmission,
  type FormFieldDefinition,
} from '@/modules/forms';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface FormFillActionState {
  ok?: boolean;
  error?: string;
  offlineQueued?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null || value === undefined) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function parseAnswersFromFormData(
  formData: FormData,
  fields: readonly FormFieldDefinition[],
): Record<string, unknown> {
  const answers: Record<string, unknown> = {};

  for (const field of fields) {
    const name = `answer_${field.key}`;
    switch (field.type) {
      case 'checklist': {
        const checked: Record<string, boolean> = {};
        for (const item of field.items ?? []) {
          checked[item.key] = formData.get(`${name}__${item.key}`) === 'true';
        }
        answers[field.key] = checked;
        break;
      }
      case 'yes_no': {
        const raw = formValue(formData, name);
        answers[field.key] = raw === 'yes' ? true : raw === 'no' ? false : null;
        break;
      }
      case 'photo': {
        const raw = formValue(formData, name);
        if (!raw) {
          answers[field.key] = { documentIds: [] };
          break;
        }
        try {
          answers[field.key] = JSON.parse(raw);
        } catch {
          answers[field.key] = { documentIds: [] };
        }
        break;
      }
      case 'signature': {
        answers[field.key] = { acknowledged: formData.get(name) === 'true' };
        break;
      }
      case 'number': {
        const raw = formValue(formData, name);
        answers[field.key] = raw ?? null;
        break;
      }
      default: {
        answers[field.key] = formValue(formData, name) ?? null;
      }
    }
  }

  return answers;
}

async function loadFields(submissionId: string) {
  return withOrgContext(async (context) => {
    const submission = await getFormSubmissionForOrg(context, submissionId);
    const template = await getFormTemplateForOrg(context, submission.templateId);
    return { submission, template };
  });
}

export async function saveDraftAction(
  _prev: FormFillActionState,
  formData: FormData,
): Promise<FormFillActionState> {
  const tErrors = await getTranslations('errors');
  const submissionId = formValue(formData, 'submissionId');
  if (!submissionId) return { error: tErrors('validationFailed') };

  try {
    const { template } = await loadFields(submissionId);
    const answers = parseAnswersFromFormData(formData, template.schema.fields);
    await withOrgContext((context) =>
      updateFormSubmissionDraft(context, {
        submissionId,
        answers,
        acknowledgementName: formValue(formData, 'acknowledgementName') ?? null,
        acknowledgementNote: formValue(formData, 'acknowledgementNote') ?? null,
      }),
    );
    revalidatePath(`/forms/${submissionId}`);
    revalidatePath('/forms');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function submitAction(
  _prev: FormFillActionState,
  formData: FormData,
): Promise<FormFillActionState> {
  const tErrors = await getTranslations('errors');
  const submissionId = formValue(formData, 'submissionId');
  if (!submissionId) return { error: tErrors('validationFailed') };

  try {
    const { template } = await loadFields(submissionId);
    const answers = parseAnswersFromFormData(formData, template.schema.fields);
    await withOrgContext((context) =>
      submitFormSubmission(context, {
        submissionId,
        answers,
        acknowledgementName: formValue(formData, 'acknowledgementName') ?? null,
        acknowledgementNote: formValue(formData, 'acknowledgementNote') ?? null,
      }),
    );
    revalidatePath(`/forms/${submissionId}`);
    revalidatePath('/forms');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    throw error;
  }
}

export async function voidAction(
  _prev: FormFillActionState,
  formData: FormData,
): Promise<FormFillActionState> {
  const tErrors = await getTranslations('errors');
  const submissionId = formValue(formData, 'submissionId');
  if (!submissionId) return { error: tErrors('validationFailed') };

  try {
    await withOrgContext((context) => voidFormSubmission(context, { submissionId }));
    revalidatePath(`/forms/${submissionId}`);
    revalidatePath('/forms');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
