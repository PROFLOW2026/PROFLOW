'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import { archiveProject } from '@/modules/projects/application/archive-project';
import { restoreProject } from '@/modules/projects/application/restore-project';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export async function archiveProjectAction(projectId: string): Promise<{ error?: string }> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();

  try {
    await withOrgContext(async (context) => {
      await archiveProject(context, { projectId });
    });
    revalidatePath('/projects');
    revalidatePath('/jobs');
    redirect({ href: '/projects', locale });
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }

  return {};
}

export async function restoreProjectAction(projectId: string): Promise<{ error?: string }> {
  const tErrors = await getTranslations('errors');

  try {
    await withOrgContext(async (context) => {
      await restoreProject(context, { projectId });
    });
    revalidatePath('/projects');
    revalidatePath('/jobs');
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/jobs/${projectId}`);
    return {};
  } catch (error) {
    if (error instanceof AppError) return { error: tErrors('unexpected') };
    throw error;
  }
}
