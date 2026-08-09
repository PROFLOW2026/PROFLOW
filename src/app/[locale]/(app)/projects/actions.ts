'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { createClient } from '@/modules/clients';
import {
  archiveProject,
  createMilestone,
  createProject,
  createWorkPackage,
  splitProjectIntoWorkPackages,
  updateProject,
  archiveMilestone,
} from '@/modules/projects';
import { withOrgContext } from '@/shared/auth/session';
import {
  AppError,
  AuthorizationError,
  DomainRuleError,
  ValidationError,
} from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import { ORIGINAL_AMOUNT_LOCKED_MESSAGE_KEY } from '@/modules/projects';

export interface ProjectFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  return String(value);
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

function mapValidationError(error: ValidationError): ProjectFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path) fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  const clientMode = String(formData.get('clientMode') ?? 'none');
  let clientId: string | null = null;

  try {
    const result = await withOrgContext(async (context) => {
      if (clientMode === 'existing') {
        const raw = formData.get('clientId');
        clientId = raw ? String(raw) : null;
      } else if (clientMode === 'new') {
        const clientName = String(formData.get('clientName') ?? '').trim();
        if (clientName) {
          const client = await createClient(context, { name: clientName });
          clientId = client.id;
        }
      }

      return createProject(context, {
        name: requiredFormValue(formData, 'name'),
        clientId,
        contractValueAmount: formValue(formData, 'contractValueAmount'),
        contractValueCurrency: formValue(formData, 'contractValueCurrency'),
        amountIncludesTax: formValue(formData, 'amountIncludesTax'),
        domainName: formValue(formData, 'domainName'),
        location: formValue(formData, 'location'),
        description: formValue(formData, 'description'),
        startDate: formValue(formData, 'startDate'),
        targetEndDate: formValue(formData, 'targetEndDate'),
        notes: formValue(formData, 'notes'),
      });
    });

    revalidatePath('/projects');
    redirect({ href: `/projects/${result.projectId}`, locale });
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}

export async function updateProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      const rawClientId = formData.get('clientId');
      const clientId =
        rawClientId === null || rawClientId === '' || rawClientId === 'none'
          ? null
          : String(rawClientId);

      await updateProject(context, {
        projectId: String(formData.get('projectId')),
        name: formValue(formData, 'name'),
        clientId,
        status: formValue(formData, 'status') as
          | 'draft'
          | 'active'
          | 'on_hold'
          | 'completed'
          | 'cancelled'
          | 'archived'
          | undefined,
        domainName: formValue(formData, 'domainName'),
        location: formValue(formData, 'location'),
        description: formValue(formData, 'description'),
        projectRole: formValue(formData, 'projectRole'),
        deliveryMode: formValue(formData, 'deliveryMode'),
        startDate: formValue(formData, 'startDate'),
        targetEndDate: formValue(formData, 'targetEndDate'),
        actualEndDate: formValue(formData, 'actualEndDate'),
        notes: formValue(formData, 'notes'),
        contractValueAmount: formValue(formData, 'contractValueAmount'),
        contractValueCurrency: formValue(formData, 'contractValueCurrency'),
        amountIncludesTax: formValue(formData, 'amountIncludesTax'),
        progressPercent: formValue(formData, 'progressPercent'),
        progressStatus:
          formValue(formData, 'progressStatus') === 'none'
            ? null
            : formValue(formData, 'progressStatus'),
      });
    });

    const projectId = String(formData.get('projectId'));
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (
      error instanceof DomainRuleError &&
      error.messageKey === ORIGINAL_AMOUNT_LOCKED_MESSAGE_KEY
    ) {
      const tProjects = await getTranslations('projects');
      return {
        error: tProjects('details.originalAmountLocked'),
        fieldErrors: {
          contractValueAmount: tProjects('details.originalAmountLocked'),
          amountIncludesTax: tProjects('details.originalAmountLocked'),
        },
      };
    }
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function archiveProjectAction(projectId: string): Promise<{ error?: string }> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  try {
    await withOrgContext(async (context) => {
      await archiveProject(context, { projectId });
    });
    revalidatePath('/projects');
    redirect({ href: '/projects', locale });
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}

export async function splitProjectAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');

  try {
    const packagesRaw = String(formData.get('additionalPackages') ?? '');
    const additionalPackages = packagesRaw
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);

    await withOrgContext(async (context) => {
      await splitProjectIntoWorkPackages(context, {
        projectId: String(formData.get('projectId')),
        defaultPackageName: formValue(formData, 'defaultPackageName'),
        additionalPackages,
      });
    });

    revalidatePath(`/projects/${String(formData.get('projectId'))}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function addWorkPackageAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await createWorkPackage(context, {
        projectId: String(formData.get('projectId')),
        name: String(formData.get('name')),
        description: formValue(formData, 'description'),
      });
    });

    revalidatePath(`/projects/${String(formData.get('projectId'))}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export interface MilestoneFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
}

export async function createMilestoneAction(
  _prev: MilestoneFormState,
  formData: FormData,
): Promise<MilestoneFormState> {
  const tErrors = await getTranslations('errors');

  try {
    const projectId = String(formData.get('projectId'));
    await withOrgContext(async (context) => {
      await createMilestone(context, {
        projectId,
        name: String(formData.get('name') ?? ''),
        targetDate: formValue(formData, 'targetDate'),
      });
    });
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function archiveMilestoneAction(
  milestoneId: string,
  projectId: string,
): Promise<{ error?: string }> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext(async (context) => {
      await archiveMilestone(context, milestoneId);
    });
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
