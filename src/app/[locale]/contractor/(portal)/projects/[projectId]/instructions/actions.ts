'use server';

import { revalidatePath } from 'next/cache';
import { requireExternalContext } from '@/modules/contractor-access';
import {
  acknowledgeInstructionAsContractor,
  reportInstructionPerformedAsContractor,
} from '@/modules/site-instructions';
import {
  FIELD_ACTION_OK,
  mapFieldActionError,
  type FieldActionState,
} from '@/modules/site-log/shared/action-state';
import { formDataToObject } from '@/modules/site-log/shared/validation';

export async function contractorInstructionAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  const payload = { projectId: input.projectId ?? '', instructionId: input.instructionId ?? '', note: input.note };
  try {
    const context = await requireExternalContext();
    if (input.intent === 'performed') await reportInstructionPerformedAsContractor(context, payload);
    else await acknowledgeInstructionAsContractor(context, payload);
    revalidatePath(`/contractor/projects/${payload.projectId}/instructions`);
    revalidatePath(`/contractor/projects/${payload.projectId}/instructions/${payload.instructionId}`);
    revalidatePath('/contractor');
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}
