'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  addProjectTeamMember,
  addProjectTeamMemberSchema,
  cancelProjectTeamAssignment,
  removeProjectTeamMember,
  updateProjectTeamAssignment,
  updateProjectTeamAssignmentSchema,
} from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, ConflictError, ValidationError } from '@/shared/errors';

export interface ProjectTeamFormState {
  error?: string;
  ok?: boolean;
}

export async function addProjectTeamMemberAction(
  _prev: ProjectTeamFormState,
  formData: FormData,
): Promise<ProjectTeamFormState> {
  const tErrors = await getTranslations('errors');
  const tWorkforce = await getTranslations('workforce');

  const plannedRaw = formData.get('plannedAllocationPercent');
  const plannedAllocationPercent =
    typeof plannedRaw === 'string' && plannedRaw.trim() !== '' ? plannedRaw.trim() : null;

  const parsed = addProjectTeamMemberSchema.safeParse({
    projectId: formData.get('projectId'),
    employeeId: formData.get('employeeId'),
    startDate: formData.get('startDate') || undefined,
    endDate: formData.get('endDate') || null,
    role: formData.get('role') || null,
    plannedAllocationPercent,
    notes: formData.get('notes') || null,
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) => addProjectTeamMember(context, parsed.data));
    revalidatePath(`/projects/${parsed.data.projectId}`);
    revalidatePath(`/jobs/${parsed.data.projectId}`);
    revalidatePath(`/workforce/employees/${parsed.data.employeeId}`);
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof ConflictError) {
      return { error: tWorkforce('errors.duplicateTeamMember') };
    }
    if (error instanceof AppError) {
      return { error: tErrors('unexpected') };
    }
    throw error;
  }
}

export async function removeProjectTeamMemberAction(input: {
  membershipId: string;
  projectId: string;
  employeeId: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) =>
      removeProjectTeamMember(context, { membershipId: input.membershipId }),
    );
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath(`/jobs/${input.projectId}`);
    revalidatePath(`/workforce/employees/${input.employeeId}`);
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: tErrors('unexpected') };
    }
    throw error;
  }
}

export async function updateProjectTeamAssignmentAction(
  _prev: ProjectTeamFormState,
  formData: FormData,
): Promise<ProjectTeamFormState> {
  const tErrors = await getTranslations('errors');
  const tWorkforce = await getTranslations('workforce');

  const plannedRaw = formData.get('plannedAllocationPercent');
  const plannedAllocationPercent =
    typeof plannedRaw === 'string' && plannedRaw.trim() !== '' ? plannedRaw.trim() : null;
  const endRaw = formData.get('endDate');
  const endDate =
    typeof endRaw === 'string' && endRaw.trim() !== '' ? endRaw.trim() : null;

  const parsed = updateProjectTeamAssignmentSchema.safeParse({
    membershipId: formData.get('membershipId'),
    startDate: formData.get('startDate') || undefined,
    endDate,
    role: formData.get('role') || null,
    plannedAllocationPercent,
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  const projectId = String(formData.get('projectId') ?? '');
  const employeeId = String(formData.get('employeeId') ?? '');

  try {
    await withOrgContext((context) => updateProjectTeamAssignment(context, parsed.data));
    if (projectId) {
      revalidatePath(`/projects/${projectId}`);
      revalidatePath(`/jobs/${projectId}`);
    }
    if (employeeId) revalidatePath(`/workforce/employees/${employeeId}`);
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof ConflictError) {
      return { error: tWorkforce('errors.duplicateTeamMember') };
    }
    if (error instanceof ValidationError) {
      return { error: error.message };
    }
    if (error instanceof AppError) {
      return { error: tErrors('unexpected') };
    }
    throw error;
  }
}

export async function cancelProjectTeamAssignmentAction(input: {
  membershipId: string;
  projectId: string;
  employeeId: string;
}): Promise<{ error?: string; ok?: boolean }> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext((context) =>
      cancelProjectTeamAssignment(context, { membershipId: input.membershipId }),
    );
    revalidatePath(`/projects/${input.projectId}`);
    revalidatePath(`/jobs/${input.projectId}`);
    revalidatePath(`/workforce/employees/${input.employeeId}`);
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: tErrors('unexpected') };
    }
    throw error;
  }
}
