'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  cancelCommunication,
  retryCommunication,
  saveCommunicationDraft,
  sendCommunication,
} from '@/modules/communications';
import type { SaveCommunicationDraftInput } from '@/modules/communications';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, AuthorizationError, ValidationError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';
import type { CommunicationEntityType } from '@/modules/communications/domain/types';
import { COMMUNICATION_ENTITY_TYPES } from '@/modules/communications/domain/types';

export interface CommunicationsFormState {
  error?: string;
  success?: string;
  fieldErrors?: Record<string, string>;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function isEntityType(value: string | undefined): value is CommunicationEntityType {
  return Boolean(value && (COMMUNICATION_ENTITY_TYPES as readonly string[]).includes(value));
}

async function mapError(error: unknown): Promise<CommunicationsFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('communications');
  if (error instanceof ValidationError) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of error.issues) {
      if (issue.path) {
        fieldErrors[issue.path] =
          issue.message === 'invalidEmail' ? t('errors.invalidEmail') : issue.message;
      }
    }
    return { error: t('errors.invalidEmail'), fieldErrors };
  }
  if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
  if (error instanceof AppError) {
    if (error.messageKey === 'communications.errors.cannotMarkSent') {
      return { error: t('errors.cannotMarkSent') };
    }
    return { error: tErrors('unexpected') };
  }
  throw error;
}

function draftInput(formData: FormData): SaveCommunicationDraftInput {
  const entityType = formValue(formData, 'relatedEntityType');
  return {
    communicationId: formValue(formData, 'communicationId'),
    relatedEntityType: isEntityType(entityType) ? entityType : 'other',
    relatedEntityId: formValue(formData, 'relatedEntityId') ?? null,
    projectId: formValue(formData, 'projectId') ?? null,
    clientId: formValue(formData, 'clientId') ?? null,
    vendorId: formValue(formData, 'vendorId') ?? null,
    recipientEmail: formValue(formData, 'recipientEmail') ?? '',
    recipientName: formValue(formData, 'recipientName') ?? null,
    subject: formValue(formData, 'subject') ?? '',
    bodyText: formValue(formData, 'bodyText') ?? '',
  };
}

export async function saveDraftAction(
  _prev: CommunicationsFormState,
  formData: FormData,
): Promise<CommunicationsFormState> {
  const t = await getTranslations('communications');
  const intent = formValue(formData, 'intent') ?? 'draft';
  try {
    const saved = await withOrgContext((context) => saveCommunicationDraft(context, draftInput(formData)));
    revalidatePath('/communications');
    if (intent === 'send') {
      const sent = await withOrgContext((context) => sendCommunication(context, saved.id));
      revalidatePath(`/communications/${sent.id}`);
      if (sent.status === 'sent') return { success: t('actions.sent') };
      if (sent.status === 'draft') return { success: t('actions.notConfigured') };
      return { error: t('actions.failed') };
    }
    const locale = await getLocale();
    redirect({ href: `/communications/${saved.id}`, locale });
  } catch (error) {
    if (error && typeof error === 'object' && 'digest' in error) throw error;
    return mapError(error);
  }
}

export async function sendNowAction(
  _prev: CommunicationsFormState,
  formData: FormData,
): Promise<CommunicationsFormState> {
  const t = await getTranslations('communications');
  const communicationId = formValue(formData, 'communicationId');
  if (!communicationId) return { error: t('errors.cannotMarkSent') };
  try {
    await withOrgContext((context) => saveCommunicationDraft(context, draftInput(formData)));
    const sent = await withOrgContext((context) => sendCommunication(context, communicationId));
    revalidatePath('/communications');
    revalidatePath(`/communications/${communicationId}`);
    if (sent.status === 'sent') return { success: t('actions.sent') };
    if (sent.status === 'draft') return { success: t('actions.notConfigured') };
    return { error: t('actions.failed') };
  } catch (error) {
    return mapError(error);
  }
}

export async function retryAction(communicationId: string): Promise<void> {
  await withOrgContext((context) => retryCommunication(context, communicationId));
  revalidatePath('/communications');
  revalidatePath(`/communications/${communicationId}`);
}

export async function cancelAction(communicationId: string): Promise<void> {
  await withOrgContext((context) => cancelCommunication(context, communicationId));
  revalidatePath('/communications');
  revalidatePath(`/communications/${communicationId}`);
}
