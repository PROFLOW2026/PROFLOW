'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { requireExternalContext } from '@/modules/contractor-access';
import { submitHandoverChecklistItem } from '@/modules/contractor-closeout';
import { mapServerActionError } from '@/shared/errors';
import type { SubcontractFormState } from '@/modules/subcontracts/ui/form-state';

function value(formData: FormData, key: string): string | undefined {
  const raw = formData.get(key);
  if (raw == null) return undefined;
  const text = String(raw).trim();
  return text === '' ? undefined : text;
}

function required(formData: FormData, key: string): string {
  return value(formData, key) ?? '';
}

async function mapHandoverError(error: unknown): Promise<SubcontractFormState> {
  const [tErrors, tHandover] = await Promise.all([getTranslations('errors'), getTranslations('handover')]);
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: { handover: (key) => tHandover(key as never) },
  });
}

export async function submitHandoverChecklistItemAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  const projectId = required(formData, 'projectId');
  try {
    const context = await requireExternalContext();
    await submitHandoverChecklistItem(context, {
      organizationId: required(formData, 'organizationId'),
      projectId,
      agreementId: required(formData, 'agreementId'),
      vendorId: required(formData, 'vendorId'),
      itemId: required(formData, 'itemId'),
      notes: value(formData, 'notes'),
    });
    revalidatePath(`/contractor/projects/${projectId}/handover`);
    return { success: true };
  } catch (error) {
    return mapHandoverError(error);
  }
}
