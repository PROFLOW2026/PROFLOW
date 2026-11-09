'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { requireExternalContext } from '@/modules/contractor-access';
import { reportPortalWarrantyIssue } from '@/modules/contractor-closeout';
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

async function mapWarrantyError(error: unknown): Promise<SubcontractFormState> {
  const [tErrors, tHandover] = await Promise.all([getTranslations('errors'), getTranslations('handover')]);
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: { handover: (key) => tHandover(key as never) },
  });
}

export async function reportPortalWarrantyIssueAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  const projectId = required(formData, 'projectId');
  try {
    const context = await requireExternalContext();
    await reportPortalWarrantyIssue(context, {
      organizationId: required(formData, 'organizationId'),
      projectId,
      agreementId: required(formData, 'agreementId'),
      vendorId: required(formData, 'vendorId'),
      title: required(formData, 'title'),
      notes: value(formData, 'notes'),
    });
    revalidatePath(`/contractor/projects/${projectId}/warranty`);
    return { success: true };
  } catch (error) {
    return mapWarrantyError(error);
  }
}
