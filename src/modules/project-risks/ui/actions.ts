'use server';

import { revalidatePath } from 'next/cache';
import { getLocale } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import { createProjectRisk } from '../application/create-project-risk';
import { updateProjectRiskStatus } from '../application/update-project-risk-status';
import type { ProjectRiskStatus } from '../domain/constants';
import { AuthorizationError, NotFoundError, ValidationError } from '@/shared/errors';

export type ProjectRiskActionResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly message: string };

function mapError(error: unknown): ProjectRiskActionResult {
  if (error instanceof ValidationError) {
    const first = error.issues[0];
    return { ok: false, message: first?.message ?? 'validation_failed' };
  }
  if (error instanceof AuthorizationError || error instanceof NotFoundError) {
    return { ok: false, message: 'not_allowed' };
  }
  throw error;
}

async function revalidateProjectRisks(projectId: string): Promise<void> {
  const locale = await getLocale();
  revalidatePath(`/${locale}/projects/${projectId}/risks`);
}

export async function createProjectRiskAction(input: {
  projectId: string;
  description: string;
  probability: number;
  impact: number;
  treatment?: string | null;
  status?: ProjectRiskStatus;
  reviewOn?: string | null;
}): Promise<ProjectRiskActionResult> {
  try {
    await withOrgContext((context) => createProjectRisk(context, input));
    await revalidateProjectRisks(input.projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function updateProjectRiskStatusAction(input: {
  projectId: string;
  riskId: string;
  status: ProjectRiskStatus;
}): Promise<ProjectRiskActionResult> {
  try {
    await withOrgContext((context) => updateProjectRiskStatus(context, input));
    await revalidateProjectRisks(input.projectId);
    return { ok: true };
  } catch (error) {
    return mapError(error);
  }
}
