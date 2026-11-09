'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { saveScheduleBaseline } from '../application/save-schedule-baseline';
import { AuthorizationError, NotFoundError, ValidationError } from '@/shared/errors';
import { PlanningEligibilityError } from '../domain/eligibility';

export type PlanningBaselineActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

function mapError(error: unknown): PlanningBaselineActionResult {
  if (error instanceof ValidationError) {
    return { ok: false, message: 'validation_failed' };
  }
  if (
    error instanceof AuthorizationError ||
    error instanceof NotFoundError ||
    error instanceof PlanningEligibilityError
  ) {
    return { ok: false, message: 'not_allowed' };
  }
  throw error;
}

async function revalidateSchedule(projectId: string): Promise<void> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/projects/${projectId}`);
}

export async function saveScheduleBaselineAction(input: {
  projectId: string;
  label?: string | null;
}): Promise<PlanningBaselineActionResult> {
  try {
    await withOrgContext((context) => saveScheduleBaseline(context, input));
    await revalidateSchedule(input.projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
