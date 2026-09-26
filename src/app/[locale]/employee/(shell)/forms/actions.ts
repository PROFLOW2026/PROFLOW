'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import {
  createFormSubmission,
  getFormTemplateForOrg,
  submitFormSubmission,
  type FormFieldDefinition,
} from '@/modules/forms';
import { listEmployeeFormOwnerProjects } from '@/modules/employee-app/application/employee-operational';
import { assertEmployeeAppContext } from '@/modules/employee-app/application/session-guard';
import { employeeHasPermission } from '@/modules/employee-app/application/load-employee-app-context';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import { PERMISSIONS } from '@/shared/permissions/catalog';

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
        answers[field.key] = { documentIds: [] };
        break;
      }
      case 'signature': {
        answers[field.key] = { acknowledged: formData.get(name) === 'true' };
        break;
      }
      case 'number': {
        answers[field.key] = formValue(formData, name) ?? null;
        break;
      }
      default: {
        answers[field.key] = formValue(formData, name) ?? null;
      }
    }
  }

  return answers;
}

export async function employeeSubmitFormAction(formData: FormData): Promise<void> {
  const locale = await getLocale();
  const templateId = formValue(formData, 'templateId') ?? '';
  const ownerRaw = formValue(formData, 'owner') ?? '';
  const separator = ownerRaw.indexOf(':');
  const ownerType = separator > 0 ? ownerRaw.slice(0, separator) : '';
  const ownerId = separator > 0 ? ownerRaw.slice(separator + 1) : '';
  const failHref = templateId
    ? `/employee/forms/${templateId}?error=1`
    : '/employee/forms?error=1';

  if (
    !templateId ||
    (ownerType !== 'project' && ownerType !== 'job' && ownerType !== 'work_order') ||
    !ownerId
  ) {
    redirect({ href: failHref, locale });
  }

  try {
    await withOrgContext(async (context) => {
      await assertEmployeeAppContext(context);
      if (!employeeHasPermission(context, PERMISSIONS.FORMS_SUBMIT)) {
        throw new DomainRuleError('Not allowed to submit forms', 'errors.validationFailed');
      }

      const owners = await listEmployeeFormOwnerProjects(context);
      const owner = owners.find((row) => row.id === ownerId && row.workKind === ownerType);
      if (!owner) {
        throw new DomainRuleError('Form owner is outside access', 'errors.validationFailed');
      }

      const template = await getFormTemplateForOrg(context, templateId);
      const answers = parseAnswersFromFormData(formData, template.schema.fields);
      const submission = await createFormSubmission(context, {
        templateId,
        ownerType: owner.workKind,
        ownerId: owner.id,
        answers,
        submittedByEmployeeId: context.employeeApp?.employeeId ?? null,
      });
      await submitFormSubmission(context, {
        submissionId: submission.id,
        answers,
        acknowledgementName: formValue(formData, 'acknowledgementName') ?? null,
        acknowledgementNote: formValue(formData, 'acknowledgementNote') ?? null,
      });
    });
  } catch (error) {
    if (error instanceof AppError) {
      redirect({ href: failHref, locale });
    }
    throw error;
  }

  revalidatePath('/employee/forms');
  redirect({ href: '/employee/forms?submitted=1', locale });
}
