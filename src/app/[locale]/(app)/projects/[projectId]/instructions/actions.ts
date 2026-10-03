'use server';

import { revalidatePath } from 'next/cache';
import {
  addInstructionNote,
  issueInstruction,
  linkInstructionConversion,
  requestInstructionConversion,
  transitionInstruction,
  updateInstruction,
} from '@/modules/site-instructions';
import {
  FIELD_ACTION_OK,
  mapFieldActionError,
  type FieldActionState,
} from '@/modules/site-log/shared/action-state';
import { formDataToObject } from '@/modules/site-log/shared/validation';
import { resolveProjectRouteBase } from '@/modules/project-workspace/domain/project-surface-path';
import { withOrgContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';
import { getLocale } from 'next-intl/server';

function revalidateInstruction(projectId: string, instructionId?: string) {
  revalidatePath(`/projects/${projectId}/instructions`);
  revalidatePath(`/employee/projects/${projectId}/instructions`);
  if (instructionId) {
    revalidatePath(`/projects/${projectId}/instructions/${instructionId}`);
    revalidatePath(`/employee/projects/${projectId}/instructions/${instructionId}`);
  }
}

export async function issueInstructionAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  const [vendorId, agreementId] = (input.party ?? '').split(':');
  let createdId: string;
  try {
    const created = await withOrgContext((context) =>
      issueInstruction(context, {
        projectId: input.projectId ?? '',
        vendorId: vendorId ?? '',
        subcontractAgreementId: agreementId || null,
        title: input.title ?? '',
        description: input.description,
        category: (input.category || 'operational') as never,
        locationId: input.locationId,
        dueDate: input.dueDate,
        logDate: input.logDate,
        meetingId: input.meetingId,
      }),
    );
    createdId = created.id;
    revalidateInstruction(input.projectId ?? '');
  } catch (error) {
    return mapFieldActionError(error);
  }
  redirect({
    href: `${resolveProjectRouteBase(input.projectId ?? '', 'instructions', input.returnBase)}/${createdId}`,
    locale: await getLocale(),
  });
}

export async function updateInstructionAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  try {
    await withOrgContext((context) =>
      updateInstruction(context, {
        projectId: input.projectId ?? '',
        instructionId: input.instructionId ?? '',
        title: input.title ?? '',
        description: input.description,
        locationId: input.locationId,
        dueDate: input.dueDate,
      }),
    );
    revalidateInstruction(input.projectId ?? '', input.instructionId);
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}

export async function transitionInstructionAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  try {
    await withOrgContext((context) =>
      transitionInstruction(context, {
        projectId: input.projectId ?? '',
        instructionId: input.instructionId ?? '',
        event: input.event as never,
        note: input.note,
      }),
    );
    revalidateInstruction(input.projectId ?? '', input.instructionId);
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}

export async function addInstructionNoteAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  try {
    await withOrgContext((context) =>
      addInstructionNote(context, {
        projectId: input.projectId ?? '',
        instructionId: input.instructionId ?? '',
        note: input.note ?? '',
      }),
    );
    revalidateInstruction(input.projectId ?? '', input.instructionId);
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}

export async function requestConversionAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  try {
    await withOrgContext((context) =>
      requestInstructionConversion(context, {
        projectId: input.projectId ?? '',
        instructionId: input.instructionId ?? '',
        target: input.target ?? '',
        note: input.note,
      }),
    );
    revalidateInstruction(input.projectId ?? '', input.instructionId);
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}

export async function linkConversionAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  try {
    await withOrgContext((context) =>
      linkInstructionConversion(context, {
        projectId: input.projectId ?? '',
        instructionId: input.instructionId ?? '',
        targetType: input.targetType ?? '',
        targetId: input.targetId ?? '',
      }),
    );
    revalidateInstruction(input.projectId ?? '', input.instructionId);
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}
