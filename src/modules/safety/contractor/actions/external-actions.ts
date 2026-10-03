'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { requireExternalContext } from '@/modules/contractor-access';
import type { ExternalContext } from '@/shared/external';
import { reportSafetyFromPortal } from '../external';
import type { ExternalSafetyReportInput } from '../schemas';
import { safetyActionError, type SafetyActionResult } from './action-result';

async function revalidatePortalSafety(projectId: string): Promise<void> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/contractor/projects/${projectId}/safety`);
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
    return safetyActionError(error);
  }
}

export async function reportSafetyFromPortalAction(
  input: ExternalSafetyReportInput,
): Promise<SafetyActionResult<{ safetyRecordId: string }>> {
  const result = await runExternal((context) => reportSafetyFromPortal(context, input));
  if (!result.ok) return result;
  await revalidatePortalSafety(input.projectId);
  return { ok: true, data: { safetyRecordId: result.value.safetyRecordId } };
}
