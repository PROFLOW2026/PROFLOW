'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { applyStandardRequirementSet, reviewComplianceDocument } from '../application/internal';
import type { ApplyStandardSetInput, ReviewDocumentInput } from '../validation/schemas';
import { withOrgContext } from '@/shared/auth/session';
import { complianceActionError, type ComplianceActionResult } from './action-result';

async function revalidateCompliance(projectId: string): Promise<void> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/projects/${projectId}/contractor-compliance`);
}

export async function reviewComplianceDocumentAction(
  input: ReviewDocumentInput,
): Promise<ComplianceActionResult> {
  try {
    await withOrgContext((context) => reviewComplianceDocument(context, input));
    await revalidateCompliance(input.projectId);
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return complianceActionError(error);
  }
}

export async function applyStandardRequirementSetAction(
  input: ApplyStandardSetInput,
): Promise<ComplianceActionResult<{ created: number }>> {
  try {
    const result = await withOrgContext((context) => applyStandardRequirementSet(context, input));
    await revalidateCompliance(input.projectId);
    return { ok: true, data: { created: result.created } };
  } catch (error) {
    unstable_rethrow(error);
    return complianceActionError(error);
  }
}
