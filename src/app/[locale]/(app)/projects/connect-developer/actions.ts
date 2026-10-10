'use server';

import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { acceptCode, previewCode } from '@/modules/connected-projects';
import { retryConnectedProjectProvisioning } from '@/modules/connected-projects';
import {
  acceptCodeSchema,
  connectionCodeSchema,
  formToObject,
} from '@/modules/connected-projects/validation/schemas';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import type { ConnectDeveloperActionState } from '@/modules/connected-projects/ui/connect-developer-form';

async function mapError(error: unknown, t: Awaited<ReturnType<typeof getTranslations>>): Promise<string> {
  if (error instanceof AppError) {
    const key = error.messageKey.startsWith('connectedProjects.errors.')
      ? error.messageKey.slice('connectedProjects.errors.'.length)
      : error.code === 'authorization_denied'
        ? 'forbidden'
        : 'generic';
    return t(`errors.${key}`);
  }
  console.error('[connected-projects] contractor action failed', error);
  return t('errors.generic');
}

export async function previewConnectionCodeAction(
  _prev: ConnectDeveloperActionState,
  formData: FormData,
): Promise<ConnectDeveloperActionState> {
  const t = await getTranslations('connectedProjects');
  const parsed = connectionCodeSchema.safeParse(formToObject(formData));
  if (!parsed.success) return { error: t('errors.validation') };

  try {
    const { preview } = await previewCode(parsed.data.code);
    return { preview, code: parsed.data.code };
  } catch (error) {
    return { error: await mapError(error, t) };
  }
}

export async function retryProvisioningAction(
  _prev: { error?: string; success?: string; projectId?: string },
  formData: FormData,
): Promise<{ error?: string; success?: string; projectId?: string }> {
  const t = await getTranslations('connectedProjects');
  const mappingId = String(formData.get('mappingId') ?? '').trim();
  if (!mappingId) return { error: t('errors.validation') };
  try {
    const result = await withOrgContext((context) => retryConnectedProjectProvisioning(context, mappingId));
    return {
      success: t('contractor.retrySuccess'),
      projectId: result.contractorProjectId,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    return { error: await mapError(error, t) };
  }
}

export async function acceptConnectionCodeAction(
  _prev: ConnectDeveloperActionState,
  formData: FormData,
): Promise<ConnectDeveloperActionState> {
  const t = await getTranslations('connectedProjects');
  const raw = formToObject(formData);
  const parsed = acceptCodeSchema.safeParse(raw);
  if (!parsed.success) return { error: t('errors.validation') };

  try {
    const result = await withOrgContext((context) =>
      acceptCode(context, {
        code: parsed.data.code,
        projectName: parsed.data.projectName,
        confirmOrganization: parsed.data.confirmOrganization,
      }),
    );
    if (!result.idempotentReplay) {
      redirect(`../projects/${result.contractorProjectId}`);
    }
    return {
      success: t('contractor.accept'),
      contractorProjectId: result.contractorProjectId,
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    return { error: await mapError(error, t) };
  }
}
