'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { createClient, createClientContact } from '@/modules/clients';
import {
  applyOrgPhasePack,
  applyOrgProjectTemplate,
  applyOrgWorkPackagePack,
  applyProjectTemplate,
  archiveProject,
  cloneProjectStructure,
  createMilestone,
  createPhase,
  createProject,
  createWorkPackage,
  DATE_ORDER_MESSAGE,
  previewProjectStructureSnapshot,
  restoreProject,
  splitProjectIntoWorkPackages,
  updateMilestone,
  updatePhase,
  updateProject,
  updateWorkPackage,
  archiveMilestone,
  type ProjectStructureSnapshot,
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
import { setProjectExpectedRemainingCost } from '@/modules/financials';

export interface ProjectFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  return String(value);
}

function requiredFormValue(formData: FormData, key: string): string {
  return formValue(formData, key) ?? '';
}

async function mapValidationError(error: ValidationError): Promise<ProjectFormState> {
  const tValidation = await getTranslations('validation');
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (!issue.path) continue;
    const message =
      issue.message === DATE_ORDER_MESSAGE || issue.message === 'validation.endBeforeStart'
        ? tValidation('endBeforeStart')
        : issue.message;
    fieldErrors[issue.path] = message;
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
  const contactMode = String(formData.get('contactMode') ?? 'none');
  let clientId: string | null = null;
  let primaryContactId: string | null = null;

  try {
    const result = await withOrgContext(async (context) => {
      const contactName = formValue(formData, 'contactName')?.trim();
      const contactPhone = formValue(formData, 'contactPhone')?.trim();
      const contactEmail = formValue(formData, 'contactEmail');

      if (clientMode === 'existing') {
        const raw = formData.get('clientId');
        clientId = raw ? String(raw) : null;
      } else if (clientMode === 'new') {
        const clientName = String(formData.get('clientName') ?? '').trim();
        if (clientName) {
          // New client: first contact may be client-wide primary; also link as project contact.
          const client = await createClient(context, { name: clientName });
          clientId = client.id;
          if (contactName && contactPhone) {
            const contact = await createClientContact(context, {
              clientId,
              name: contactName,
              phone: contactPhone,
              email: contactEmail,
              role: 'primary',
            });
            primaryContactId = contact.id;
          }
        }
      }

      if (clientId && clientMode === 'existing') {
        if (contactMode === 'new' && contactName && contactPhone) {
          // Project quick-add must NOT flip client-wide primary role.
          const contact = await createClientContact(context, {
            clientId,
            name: contactName,
            phone: contactPhone,
            email: contactEmail,
            role: 'other',
          });
          primaryContactId = contact.id;
        } else if (contactMode === 'existing') {
          const contactId = formValue(formData, 'contactId');
          if (contactId) primaryContactId = contactId;
        }
      }

      return createProject(context, {
        name: requiredFormValue(formData, 'name'),
        clientId,
        primaryContactId,
        contractValueAmount: formValue(formData, 'contractValueAmount'),
        contractValueCurrency: formValue(formData, 'contractValueCurrency'),
        amountIncludesTax: formValue(formData, 'amountIncludesTax'),
        openingReductionAmount: formValue(formData, 'openingReductionAmount'),
        domainName: formValue(formData, 'domainName'),
        location: formValue(formData, 'location'),
        description: formValue(formData, 'description'),
        startDate: formValue(formData, 'startDate'),
        targetEndDate: formValue(formData, 'targetEndDate'),
        notes: formValue(formData, 'notes'),
      }).then(async (created) => {
        const templateKey = formValue(formData, 'templateKey');
        if (templateKey && templateKey !== 'none') {
          try {
            await applyProjectTemplate(context, {
              projectId: created.projectId,
              templateKey,
              locale: locale === 'he-IL' ? 'he-IL' : 'en',
            });
          } catch {
            // Project was created; template apply is best-effort on create.
          }
        }
        return created;
      });
    });

    revalidatePath('/projects');
    redirect({ href: `/projects/${result.projectId}`, locale });
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
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

      const contactMode = String(formData.get('contactMode') ?? 'existing');
      let primaryContactId: string | null | undefined = undefined;

      if (clientId) {
        if (contactMode === 'new') {
          const contactName = formValue(formData, 'contactName')?.trim();
          const contactPhone = formValue(formData, 'contactPhone')?.trim();
          const contactEmail = formValue(formData, 'contactEmail');
          if (contactName && contactPhone) {
            const contact = await createClientContact(context, {
              clientId,
              name: contactName,
              phone: contactPhone,
              email: contactEmail,
              role: 'other',
            });
            primaryContactId = contact.id;
          }
        } else if (contactMode === 'none') {
          primaryContactId = null;
        } else {
          const rawContactId = formValue(formData, 'primaryContactId');
          primaryContactId =
            !rawContactId || rawContactId === 'none' ? null : rawContactId;
        }
      } else {
        primaryContactId = null;
      }

      await updateProject(context, {
        projectId: String(formData.get('projectId')),
        name: formValue(formData, 'name'),
        clientId,
        primaryContactId,
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
        openingReductionAmount: formValue(formData, 'openingReductionAmount'),
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
    if (error instanceof ValidationError) return await mapValidationError(error);
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
          openingReductionAmount: tProjects('details.originalAmountLocked'),
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
    revalidatePath('/jobs');
    redirect({ href: '/projects', locale });
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}

export async function restoreProjectAction(projectId: string): Promise<{ error?: string }> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await restoreProject(context, { projectId });
    });
    revalidatePath('/projects');
    revalidatePath('/jobs');
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/jobs/${projectId}`);
    return {};
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
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
    if (error instanceof ValidationError) return await mapValidationError(error);
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
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function updateWorkPackageProgressAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const projectId = String(formData.get('projectId') ?? '');

  try {
    await withOrgContext(async (context) => {
      await updateWorkPackage(context, {
        workPackageId: String(formData.get('workPackageId') ?? ''),
        startDate: formValue(formData, 'startDate') ?? null,
        endDate: formValue(formData, 'endDate') ?? null,
        progressPercent: formValue(formData, 'progressPercent') ?? null,
      });
    });

    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function createPhaseAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const projectId = String(formData.get('projectId') ?? '');

  try {
    await withOrgContext(async (context) => {
      await createPhase(context, {
        workPackageId: String(formData.get('workPackageId') ?? ''),
        name: String(formData.get('name') ?? ''),
        startDate: formValue(formData, 'startDate'),
        endDate: formValue(formData, 'endDate'),
      });
    });

    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
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
    if (error instanceof ValidationError) return await mapValidationError(error);
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

export async function updateMilestoneStatusAction(
  milestoneId: string,
  projectId: string,
  status: 'planned' | 'achieved' | 'missed' | 'cancelled',
): Promise<{ error?: string }> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext(async (context) => {
      await updateMilestone(context, { milestoneId, status });
    });
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function applyProjectTemplateAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();
  const projectId = String(formData.get('projectId') ?? '');

  try {
    await withOrgContext(async (context) => {
      await applyProjectTemplate(context, {
        projectId,
        templateKey: String(formData.get('templateKey') ?? ''),
        locale: locale === 'he-IL' ? 'he-IL' : 'en',
      });
    });
    revalidatePath(`/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof DomainRuleError) {
      const tProjects = await getTranslations('projects');
      return { error: tProjects('errors.templateRequiresSimpleProject') };
    }
    if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function applyOrgProjectTemplateAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const projectId = String(formData.get('projectId') ?? '');

  try {
    await withOrgContext(async (context) => {
      await applyOrgProjectTemplate(context, {
        projectId,
        orgTemplateId: String(formData.get('orgTemplateId') ?? ''),
      });
    });
    revalidatePath(`/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof DomainRuleError) {
      const tProjects = await getTranslations('projects');
      return { error: tProjects('errors.templateRequiresSimpleProject') };
    }
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function cloneProjectStructureAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const projectId = String(formData.get('projectId') ?? '');

  try {
    await withOrgContext(async (context) => {
      await cloneProjectStructure(context, {
        targetProjectId: projectId,
        sourceProjectId: String(formData.get('sourceProjectId') ?? ''),
      });
    });
    revalidatePath(`/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof DomainRuleError) {
      const tProjects = await getTranslations('projects');
      return { error: tProjects('errors.templateRequiresSimpleProject') };
    }
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function previewCloneStructureAction(
  sourceProjectId: string,
): Promise<{ snapshot?: ProjectStructureSnapshot; error?: string }> {
  const tErrors = await getTranslations('errors');
  try {
    const snapshot = await withOrgContext((context) =>
      previewProjectStructureSnapshot(context, sourceProjectId),
    );
    return { snapshot };
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function applyOrgPhasePackAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const projectId = String(formData.get('projectId') ?? '');

  try {
    await withOrgContext(async (context) => {
      await applyOrgPhasePack(context, {
        workPackageId: String(formData.get('workPackageId') ?? ''),
        phasePackId: String(formData.get('phasePackId') ?? ''),
      });
    });
    revalidatePath(`/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function applyOrgWorkPackagePackAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const projectId = String(formData.get('projectId') ?? '');

  try {
    await withOrgContext(async (context) => {
      await applyOrgWorkPackagePack(context, {
        projectId,
        workPackagePackId: String(formData.get('workPackagePackId') ?? ''),
      });
    });
    revalidatePath(`/projects/${projectId}`);
    return { success: true };
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function updatePhaseScheduleAction(
  _prev: ProjectFormState,
  formData: FormData,
): Promise<ProjectFormState> {
  const tErrors = await getTranslations('errors');
  const projectId = String(formData.get('projectId') ?? '');

  try {
    await withOrgContext(async (context) => {
      await updatePhase(context, {
        phaseId: String(formData.get('phaseId') ?? ''),
        startDate: formValue(formData, 'startDate') ?? null,
        endDate: formValue(formData, 'endDate') ?? null,
      });
    });
    revalidatePath(`/projects/${projectId}`);
    return {};
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}

export async function setProjectExpectedRemainingCostAction(
  projectId: string,
  amount: string | null,
): Promise<{ error?: string; success?: boolean }> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => setProjectExpectedRemainingCost(context, projectId, amount));
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/projects/${projectId}/financials`);
    return { success: true };
  } catch (error) {
    if (error instanceof ValidationError) return await mapValidationError(error);
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
