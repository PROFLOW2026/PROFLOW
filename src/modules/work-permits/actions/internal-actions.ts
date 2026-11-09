'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { unstable_rethrow } from 'next/navigation';
import { withOrgContext } from '@/shared/auth/session';
import {
  approveWorkPermit,
  createWorkPermitDraft,
  rejectWorkPermit,
  submitWorkPermit,
} from '../application/permits';
import type { CreateWorkPermitInput, WorkPermitMutationInput } from '../validation/schemas';
import { workPermitActionError, type WorkPermitActionResult } from './action-result';

async function revalidateWorkPermits(projectId: string): Promise<void> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/projects/${projectId}/work-permits`);
}

export async function createWorkPermitDraftAction(
  input: CreateWorkPermitInput,
): Promise<WorkPermitActionResult<{ workPermitId: string }>> {
  try {
    const created = await withOrgContext((context) => createWorkPermitDraft(context, input));
    await revalidateWorkPermits(input.projectId);
    return { ok: true, data: { workPermitId: created.id } };
  } catch (error) {
    unstable_rethrow(error);
    return workPermitActionError(error);
  }
}

async function runTransition(
  input: WorkPermitMutationInput,
  run: typeof submitWorkPermit,
): Promise<WorkPermitActionResult> {
  try {
    await withOrgContext((context) => run(context, input));
    await revalidateWorkPermits(input.projectId);
    return { ok: true };
  } catch (error) {
    unstable_rethrow(error);
    return workPermitActionError(error);
  }
}

export async function submitWorkPermitAction(input: WorkPermitMutationInput): Promise<WorkPermitActionResult> {
  return runTransition(input, submitWorkPermit);
}

export async function approveWorkPermitAction(input: WorkPermitMutationInput): Promise<WorkPermitActionResult> {
  return runTransition(input, approveWorkPermit);
}

export async function rejectWorkPermitAction(input: WorkPermitMutationInput): Promise<WorkPermitActionResult> {
  return runTransition(input, rejectWorkPermit);
}
