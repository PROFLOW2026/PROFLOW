'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  approveChangeRequest,
  cancelChangeRequest,
  createChangeRequest,
  createQuoteVersion,
  issueQuoteVersion,
  rejectChangeRequest,
  reverseChangeOrder,
  submitChangeRequestForApproval,
  updateChangeRequest,
} from '@/modules/commercial';
import { AppError, isAppError } from '@/shared/errors';
import { withOrgContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';

export interface FormActionState {
  error?: string;
  success?: boolean;
  /** Local draft queued - not server truth. */
  offlineQueued?: boolean;
}

function errorMessage(error: unknown, fallback: string): string {
  if (isAppError(error)) return fallback;
  return fallback;
}

export async function createChangeRequestAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const t = await getTranslations('errors');
  const locale = await getLocale();

  try {
    const result = await withOrgContext(async (context) =>
      createChangeRequest(context, {
        projectId: String(formData.get('projectId') ?? ''),
        title: String(formData.get('title') ?? ''),
        description: (formData.get('description') as string) || null,
        direction: (formData.get('direction') as 'addition' | 'reduction') || 'addition',
        requestedAmount: (formData.get('requestedAmount') as string) || null,
        contractId: (formData.get('contractId') as string) || null,
      }),
    );

    revalidatePath('/changes');
    redirect({ href: `/changes/${result.changeRequestId}`, locale });
  } catch (error) {
    if (error instanceof AppError && error.messageKey) return { error: t('validationFailed') };
    if (isAppError(error)) return { error: t('unexpected') };
    throw error;
  }
}

export async function submitForApprovalAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const t = await getTranslations('errors');
  const changeRequestId = String(formData.get('changeRequestId') ?? '');
  const recordSent = formData.get('recordSent') === 'true';

  try {
    await withOrgContext(async (context) =>
      submitChangeRequestForApproval(context, changeRequestId, { recordSent }),
    );
    revalidatePath(`/changes/${changeRequestId}`);
    return { success: true };
  } catch (error) {
    return { error: errorMessage(error, t('unexpected')) };
  }
}

export async function rejectChangeAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const t = await getTranslations('errors');
  const changeRequestId = String(formData.get('changeRequestId') ?? '');

  try {
    await withOrgContext(async (context) =>
      rejectChangeRequest(context, changeRequestId, (formData.get('notes') as string) || null),
    );
    revalidatePath(`/changes/${changeRequestId}`);
    return { success: true };
  } catch (error) {
    return { error: errorMessage(error, t('unexpected')) };
  }
}

export async function cancelChangeAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const t = await getTranslations('errors');
  const changeRequestId = String(formData.get('changeRequestId') ?? '');

  try {
    await withOrgContext(async (context) =>
      cancelChangeRequest(context, changeRequestId, (formData.get('notes') as string) || null),
    );
    revalidatePath(`/changes/${changeRequestId}`);
    return { success: true };
  } catch (error) {
    return { error: errorMessage(error, t('unexpected')) };
  }
}

export async function createQuoteVersionAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const t = await getTranslations('errors');
  const locale = await getLocale();
  const changeRequestId = String(formData.get('changeRequestId') ?? '');

  try {
    const result = await withOrgContext(async (context) =>
      createQuoteVersion(context, {
        changeRequestId,
        lines: [
          {
            description: String(formData.get('lineDescription') ?? ''),
            lineTotal: String(formData.get('lineTotal') ?? ''),
          },
        ],
        taxAmount: (formData.get('taxAmount') as string) || null,
        validUntil: (formData.get('validUntil') as string) || null,
        notes: (formData.get('notes') as string) || null,
      }),
    );

    await withOrgContext(async (context) =>
      issueQuoteVersion(context, { quoteVersionId: result.quoteVersionId }),
    );

    revalidatePath(`/changes/${changeRequestId}`);
    redirect({ href: `/changes/${changeRequestId}`, locale });
  } catch (error) {
    if (isAppError(error)) return { error: t('validationFailed') };
    throw error;
  }
}

export async function approveChangeAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const t = await getTranslations('errors');
  const locale = await getLocale();
  const changeRequestId = String(formData.get('changeRequestId') ?? '');

  try {
    await withOrgContext(async (context) =>
      approveChangeRequest(context, {
        changeRequestId,
        quoteVersionId: (formData.get('quoteVersionId') as string) || null,
        approverName: (formData.get('approverName') as string) || null,
        effectiveDate: (formData.get('effectiveDate') as string) || null,
        notes: (formData.get('notes') as string) || null,
      }),
    );

    revalidatePath(`/changes/${changeRequestId}`);
    redirect({ href: `/changes/${changeRequestId}`, locale });
  } catch (error) {
    if (isAppError(error)) return { error: t('validationFailed') };
    throw error;
  }
}

async function mapChangesError(error: unknown): Promise<FormActionState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('changes');
  if (!isAppError(error)) throw error;
  if (error.messageKey.startsWith('changes.')) {
    const key = error.messageKey.replace(/^changes\./, '') as
      | 'errors.alreadyReversed'
      | 'errors.cannotReverseReversal'
      | 'errors.unsafeBilling';
    return { error: t(key) };
  }
  return { error: tErrors('unexpected') };
}

export async function reverseChangeOrderAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const changeOrderId = String(formData.get('changeOrderId') ?? '');
  const changeRequestId = String(formData.get('changeRequestId') ?? '');
  const reason = String(formData.get('reason') ?? '');

  try {
    await withOrgContext(async (context) =>
      reverseChangeOrder(context, {
        changeOrderId,
        reason,
        effectiveDate: (formData.get('effectiveDate') as string) || null,
      }),
    );

    revalidatePath('/changes');
    if (changeRequestId) revalidatePath(`/changes/${changeRequestId}`);
    return { success: true };
  } catch (error) {
    return mapChangesError(error);
  }
}

export async function updateChangeRequestAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const t = await getTranslations('errors');

  try {
    await withOrgContext(async (context) =>
      updateChangeRequest(context, {
        changeRequestId: String(formData.get('changeRequestId') ?? ''),
        title: String(formData.get('title') ?? ''),
        description: (formData.get('description') as string) || null,
        direction: (formData.get('direction') as 'addition' | 'reduction') || 'addition',
        requestedAmount: (formData.get('requestedAmount') as string) || null,
      }),
    );
    return { success: true };
  } catch (error) {
    return { error: errorMessage(error, t('unexpected')) };
  }
}
