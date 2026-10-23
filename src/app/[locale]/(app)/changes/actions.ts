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
  editChangeOrderRetroactive,
  reverseChangeOrder,
  submitChangeRequestForApproval,
  updateChangeRequest,
} from '@/modules/commercial';
import { listSimilarChangeOrders } from '@/modules/commercial/application/find-similar-change-orders';
import { isAppError, mapServerActionError } from '@/shared/errors';
import { withOrgContext } from '@/shared/auth/session';
import { redirect } from '@/shared/i18n/navigation';

export interface FormActionState {
  error?: string;
  success?: boolean;
  /** Local draft queued - not server truth. */
  offlineQueued?: boolean;
}

async function mapChangesActionError(error: unknown): Promise<FormActionState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('changes');
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      changes: (key) => t(key as 'errors.notDraft'),
    },
  });
}

export async function createChangeRequestAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
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
    if (isAppError(error)) return mapChangesActionError(error);
    throw error;
  }
}

export async function submitForApprovalAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const changeRequestId = String(formData.get('changeRequestId') ?? '');
  const recordSent = formData.get('recordSent') === 'true';

  try {
    await withOrgContext(async (context) =>
      submitChangeRequestForApproval(context, changeRequestId, { recordSent }),
    );
    revalidatePath(`/changes/${changeRequestId}`);
    return { success: true };
  } catch (error) {
    if (isAppError(error)) return mapChangesActionError(error);
    throw error;
  }
}

export async function rejectChangeAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const changeRequestId = String(formData.get('changeRequestId') ?? '');

  try {
    await withOrgContext(async (context) =>
      rejectChangeRequest(context, changeRequestId, (formData.get('notes') as string) || null),
    );
    revalidatePath(`/changes/${changeRequestId}`);
    return { success: true };
  } catch (error) {
    if (isAppError(error)) return mapChangesActionError(error);
    throw error;
  }
}

export async function cancelChangeAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const changeRequestId = String(formData.get('changeRequestId') ?? '');

  try {
    await withOrgContext(async (context) =>
      cancelChangeRequest(context, changeRequestId, (formData.get('notes') as string) || null),
    );
    revalidatePath(`/changes/${changeRequestId}`);
    return { success: true };
  } catch (error) {
    if (isAppError(error)) return mapChangesActionError(error);
    throw error;
  }
}

export async function createQuoteVersionAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
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
    if (isAppError(error)) return mapChangesActionError(error);
    throw error;
  }
}

export async function approveChangeAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
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
    if (isAppError(error)) return mapChangesActionError(error);
    throw error;
  }
}

export async function reverseChangeOrderAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const changeOrderId = String(formData.get('changeOrderId') ?? '');
  const changeRequestId = String(formData.get('changeRequestId') ?? '');
  const reason = String(formData.get('reason') ?? '');

  try {
    if (formData.get('changeAcknowledged') !== 'true') {
      const tErrors = await getTranslations('errors');
      return { error: tErrors('confirmRequired') };
    }
    await withOrgContext(async (context) =>
      reverseChangeOrder(context, {
        changeOrderId,
        reason,
        effectiveDate: (formData.get('effectiveDate') as string) || undefined,
        changeAcknowledged: true,
      }),
    );

    revalidatePath('/changes');
    if (changeRequestId) revalidatePath(`/changes/${changeRequestId}`);
    return { success: true };
  } catch (error) {
    if (isAppError(error)) return mapChangesActionError(error);
    throw error;
  }
}

export async function previewSimilarChangeOrdersAction(input: {
  excludeChangeOrderId: string;
  projectId: string;
  reference: string | null;
}) {
  return withOrgContext((context) => listSimilarChangeOrders(context, input));
}

export async function editChangeOrderRetroactiveAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
  const changeRequestId = String(formData.get('changeRequestId') ?? '');
  const billingRaw = formData.get('billingCondition');
  const billingCondition =
    billingRaw === 'immediate' ||
    billingRaw === 'milestone' ||
    billingRaw === 'custom_terms' ||
    billingRaw === 'deferred'
      ? billingRaw
      : null;

  try {
    if (formData.get('changeAcknowledged') !== 'true') {
      const tErrors = await getTranslations('errors');
      return { error: tErrors('confirmRequired') };
    }
    await withOrgContext(async (context) =>
      editChangeOrderRetroactive(context, {
        changeOrderId: String(formData.get('changeOrderId') ?? ''),
        reference: String(formData.get('reference') ?? '').trim() || null,
        effectiveDate: String(formData.get('effectiveDate') ?? '').trim() || undefined,
        notes: String(formData.get('notes') ?? '').trim() || null,
        billingCondition,
        amount: (() => {
          const raw = String(formData.get('amount') ?? '').trim();
          return raw || undefined;
        })(),
        changeAcknowledged: true,
        amountChangeAcknowledged:
          formData.get('amountChangeAcknowledged') === 'true' ? true : undefined,
      }),
    );

    if (changeRequestId) revalidatePath(`/changes/${changeRequestId}`);
    revalidatePath('/changes');
    return { success: true };
  } catch (error) {
    if (isAppError(error)) return mapChangesActionError(error);
    throw error;
  }
}

export async function updateChangeRequestAction(
  _prev: FormActionState,
  formData: FormData,
): Promise<FormActionState> {
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
    if (isAppError(error)) return mapChangesActionError(error);
    throw error;
  }
}
