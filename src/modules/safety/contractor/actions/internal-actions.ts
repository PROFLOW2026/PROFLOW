'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { reportContractorSafety } from '../internal';
import type { ReportContractorSafetyInput } from '../schemas';
import { withOrgContext } from '@/shared/auth/session';
import { safetyActionError, type SafetyActionResult } from './action-result';

async function revalidateSafety(projectId: string): Promise<void> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/projects/${projectId}/site-safety`);
}

export async function reportContractorSafetyAction(
  input: ReportContractorSafetyInput,
): Promise<SafetyActionResult<{ safetyRecordId: string }>> {
  try {
    const result = await withOrgContext((context) => reportContractorSafety(context, input));
    await revalidateSafety(input.projectId);
    return { ok: true, data: { safetyRecordId: result.id } };
  } catch (error) {
    unstable_rethrow(error);
    return safetyActionError(error);
  }
}
