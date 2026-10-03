'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import type { ExternalContext } from '@/shared/external';
import { submitContractorComplianceDocument } from '../application/external';
import type { SubmitDocumentInput } from '../validation/schemas';
import { complianceActionError, type ComplianceActionResult } from './action-result';

async function revalidatePortalCompliance(projectId: string): Promise<void> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/contractor/projects/${projectId}/compliance`);
}

async function runExternal<T>(fn: (context: ExternalContext) => Promise<T>): Promise<
  { ok: true; value: T } | { ok: false; error: string; fieldErrors?: Record<string, string> }
> {
  try {
    const context = await requireExternalContext();
    const value = await fn(context);
    return { ok: true, value };
  } catch (error) {
    unstable_rethrow(error);
    return complianceActionError(error);
  }
}

export async function submitContractorComplianceDocumentAction(
  input: SubmitDocumentInput & { readonly organizationId: string },
): Promise<ComplianceActionResult<{ documentId: string }>> {
  const result = await runExternal((context) => submitContractorComplianceDocument(context, input));
  if (!result.ok) return result;
  await revalidatePortalCompliance(input.projectId);
  return { ok: true, data: { documentId: result.value.documentId } };
}
