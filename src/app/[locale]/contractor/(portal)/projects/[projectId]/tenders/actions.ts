'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { requireExternalContext } from '@/modules/contractor-access';
import { submitContractorBid } from '@/modules/contractor-procurement';
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

async function mapBidError(error: unknown): Promise<SubcontractFormState> {
  const [tErrors, tAwards] = await Promise.all([getTranslations('errors'), getTranslations('awards')]);
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: { awards: (key) => tAwards(key as never) },
  });
}

export async function submitContractorBidAction(
  _prev: SubcontractFormState,
  formData: FormData,
): Promise<SubcontractFormState> {
  const projectId = required(formData, 'projectId');
  const packageId = required(formData, 'packageId');
  const leadTimeRaw = value(formData, 'leadTimeDays');
  try {
    const context = await requireExternalContext();
    await submitContractorBid(context, {
      organizationId: required(formData, 'organizationId'),
      projectId,
      packageId,
      bidAmount: required(formData, 'bidAmount'),
      notes: value(formData, 'notes'),
      leadTimeDays: leadTimeRaw ? Number.parseInt(leadTimeRaw, 10) : undefined,
    });
    revalidatePath(`/contractor/projects/${projectId}/tenders`);
    revalidatePath(`/contractor/projects/${projectId}/tenders/${packageId}`);
    return { success: true };
  } catch (error) {
    return mapBidError(error);
  }
}
