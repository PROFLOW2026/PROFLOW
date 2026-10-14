'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  confirmProjectCoverUpload,
  prepareProjectCoverUpload,
  removeProjectCover,
} from '@/modules/projects/application/project-cover-image';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';

export interface ProjectCoverActionState {
  ok?: boolean;
  error?: string;
}

export interface PrepareProjectCoverResult {
  ok?: boolean;
  error?: string;
  uploadUrl?: string;
  storageKey?: string;
  uploadToken?: string | null;
  uploadPath?: string;
}

export async function prepareProjectCoverUploadAction(input: {
  projectId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
}): Promise<PrepareProjectCoverResult> {
  const tErrors = await getTranslations('errors');
  const tCover = await getTranslations('projects.cover');
  try {
    const prepared = await withOrgContext((context) => prepareProjectCoverUpload(context, input));
    return {
      ok: true,
      uploadUrl: prepared.uploadUrl,
      storageKey: prepared.storageKey,
      uploadToken: prepared.token,
      uploadPath: prepared.path,
    };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.messageKey === 'projects.cover.schemaPending') {
        return { error: tCover('schemaPending') };
      }
      if (error.messageKey === 'projects.cover.storageNotConfigured') {
        return { error: tCover('storageNotConfigured') };
      }
      return { error: tErrors('validationFailed') };
    }
    throw error;
  }
}

export async function confirmProjectCoverUploadAction(input: {
  projectId: string;
  storageKey: string;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
  height?: number | null;
}): Promise<ProjectCoverActionState> {
  const tErrors = await getTranslations('errors');
  const tCover = await getTranslations('projects.cover');
  try {
    await withOrgContext((context) => confirmProjectCoverUpload(context, input));
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.messageKey === 'projects.cover.schemaPending') {
        return { error: tCover('schemaPending') };
      }
      return { error: tErrors('validationFailed') };
    }
    throw error;
  }
}

export async function removeProjectCoverAction(input: {
  projectId: string;
}): Promise<ProjectCoverActionState> {
  const tErrors = await getTranslations('errors');
  const tCover = await getTranslations('projects.cover');
  try {
    await withOrgContext((context) => removeProjectCover(context, input));
    revalidatePath(`/projects/${input.projectId}`);
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) {
      if (error.messageKey === 'projects.cover.schemaPending') {
        return { error: tCover('schemaPending') };
      }
      return { error: tErrors('validationFailed') };
    }
    throw error;
  }
}
