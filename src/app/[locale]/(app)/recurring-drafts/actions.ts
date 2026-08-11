'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  createRecurringDraft,
  updateRecurringDraft,
  pauseRecurringDraft,
  resumeRecurringDraft,
  endRecurringDraft,
  generateRecurringDraftNow,
  emptyToNull,
  isDraftKind,
  isDraftFrequency,
} from '@/modules/recurring-drafts';
import type { RecurringDraftFormState } from '@/modules/recurring-drafts/ui/draft-form';
import { withOrgContext } from '@/shared/auth/session';
import {
  AppError,
  AuthorizationError,
  ConflictError,
  DomainRuleError,
  ValidationError,
} from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function buildPayload(kind: string, formData: FormData, title: string): unknown {
  const amount = formValue(formData, 'amount') ?? '';
  const currency = (formValue(formData, 'currency') ?? '').toUpperCase();
  const notes = formValue(formData, 'notes') ?? null;
  const projectId = emptyToNull(formValue(formData, 'projectId') ?? null);
  const dueDaysRaw = formValue(formData, 'dueDays');
  const dueDays = dueDaysRaw ? Number(dueDaysRaw) : null;

  if (kind === 'expense') {
    return {
      amount,
      currency,
      description: formValue(formData, 'description') ?? null,
      supplierName: formValue(formData, 'supplierName') ?? null,
      projectId,
      notes,
    };
  }

  if (kind === 'vendor_bill') {
    const lineDescription = formValue(formData, 'lineDescription') || title;
    return {
      vendorId: formValue(formData, 'vendorId') ?? '',
      projectId,
      reference: formValue(formData, 'reference') ?? null,
      currency,
      totalAmount: amount,
      notes,
      dueDays,
      lines: [
        {
          description: lineDescription,
          quantity: '1',
          unitAmount: amount,
          lineTotal: amount,
          currency,
        },
      ],
    };
  }

  return {
    projectId: projectId ?? '',
    amount,
    currency,
    reference: formValue(formData, 'reference') ?? null,
    notes,
    dueDays,
    finalize: false,
  };
}

async function mapError(error: unknown): Promise<RecurringDraftFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('recurringDrafts');

  if (error instanceof ValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      if (!issue.path) continue;
      fieldErrors[issue.path] = issue.message;
    }
    return { error: tErrors('validationFailed'), fieldErrors };
  }
  if (error instanceof DomainRuleError) {
    const key = error.messageKey;
    if (key.startsWith('recurringDrafts.errors.')) {
      const short = key.slice('recurringDrafts.errors.'.length) as
        | 'notActive'
        | 'ended'
        | 'notPausable'
        | 'notResumable'
        | 'alreadyEnded'
        | 'notEditable'
        | 'endBeforeNext'
        | 'mustRemainDraft'
        | 'finalizeForbidden'
        | 'kindMismatch';
      return { error: t(`errors.${short}`) };
    }
    return { error: tErrors('unexpected') };
  }
  if (error instanceof ConflictError) {
    if (error.messageKey === 'recurringDrafts.errors.alreadyGeneratedToday') {
      return { error: t('errors.alreadyGeneratedToday') };
    }
    return { error: tErrors('conflict') };
  }
  if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
  if (error instanceof AppError) return { error: tErrors('unexpected') };
  throw error;
}

export async function createRecurringDraftAction(
  _prev: RecurringDraftFormState,
  formData: FormData,
): Promise<RecurringDraftFormState> {
  const locale = await getLocale();
  const kindRaw = formValue(formData, 'draftKind') ?? '';
  const frequencyRaw = formValue(formData, 'frequency') ?? 'monthly';
  if (!isDraftKind(kindRaw) || !isDraftFrequency(frequencyRaw)) {
    const tErrors = await getTranslations('errors');
    return { error: tErrors('validationFailed') };
  }

  try {
    const title = formValue(formData, 'title') ?? '';
    const created = await withOrgContext((context) =>
      createRecurringDraft(context, {
        draftKind: kindRaw,
        title,
        frequency: frequencyRaw,
        intervalCount: Number(formValue(formData, 'intervalCount') ?? '1'),
        nextRunDate: formValue(formData, 'nextRunDate') ?? '',
        endDate: formValue(formData, 'endDate') ?? null,
        payload: buildPayload(kindRaw, formData, title),
      }),
    );
    revalidatePath('/recurring-drafts');
    redirect({ href: `/recurring-drafts/${created.id}`, locale });
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof DomainRuleError ||
      error instanceof AuthorizationError ||
      error instanceof ConflictError ||
      error instanceof AppError
    ) {
      return mapError(error);
    }
    throw error;
  }
}

export async function updateRecurringDraftAction(
  _prev: RecurringDraftFormState,
  formData: FormData,
): Promise<RecurringDraftFormState> {
  const locale = await getLocale();
  const draftId = formValue(formData, 'draftId') ?? '';
  const frequencyRaw = formValue(formData, 'frequency') ?? 'monthly';
  if (!isDraftFrequency(frequencyRaw)) {
    const tErrors = await getTranslations('errors');
    return { error: tErrors('validationFailed') };
  }

  try {
    const title = formValue(formData, 'title') ?? '';
    const kindRaw = formValue(formData, 'draftKind') ?? '';
    await withOrgContext((context) =>
      updateRecurringDraft(context, {
        draftId,
        title,
        frequency: frequencyRaw,
        intervalCount: Number(formValue(formData, 'intervalCount') ?? '1'),
        nextRunDate: formValue(formData, 'nextRunDate') ?? '',
        endDate: formValue(formData, 'endDate') ?? null,
        payload: buildPayload(kindRaw, formData, title),
      }),
    );
    revalidatePath('/recurring-drafts');
    revalidatePath(`/recurring-drafts/${draftId}`);
    redirect({ href: `/recurring-drafts/${draftId}`, locale });
  } catch (error) {
    if (
      error instanceof ValidationError ||
      error instanceof DomainRuleError ||
      error instanceof AuthorizationError ||
      error instanceof ConflictError ||
      error instanceof AppError
    ) {
      return mapError(error);
    }
    throw error;
  }
}

export async function pauseRecurringDraftAction(
  _prev: RecurringDraftFormState,
  formData: FormData,
): Promise<RecurringDraftFormState> {
  try {
    const draftId = formValue(formData, 'draftId') ?? '';
    await withOrgContext((context) => pauseRecurringDraft(context, draftId));
    revalidatePath('/recurring-drafts');
    revalidatePath(`/recurring-drafts/${draftId}`);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function resumeRecurringDraftAction(
  _prev: RecurringDraftFormState,
  formData: FormData,
): Promise<RecurringDraftFormState> {
  try {
    const draftId = formValue(formData, 'draftId') ?? '';
    await withOrgContext((context) => resumeRecurringDraft(context, draftId));
    revalidatePath('/recurring-drafts');
    revalidatePath(`/recurring-drafts/${draftId}`);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function endRecurringDraftAction(
  _prev: RecurringDraftFormState,
  formData: FormData,
): Promise<RecurringDraftFormState> {
  try {
    const draftId = formValue(formData, 'draftId') ?? '';
    await withOrgContext((context) => endRecurringDraft(context, draftId));
    revalidatePath('/recurring-drafts');
    revalidatePath(`/recurring-drafts/${draftId}`);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}

export async function generateRecurringDraftAction(
  _prev: RecurringDraftFormState,
  formData: FormData,
): Promise<RecurringDraftFormState> {
  try {
    const draftId = formValue(formData, 'draftId') ?? '';
    await withOrgContext((context) => generateRecurringDraftNow(context, { draftId }));
    revalidatePath('/recurring-drafts');
    revalidatePath(`/recurring-drafts/${draftId}`);
    return { success: true };
  } catch (error) {
    return mapError(error);
  }
}
