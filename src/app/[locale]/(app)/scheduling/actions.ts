'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  cancelBooking,
  createBooking,
  createUnavailability,
  updateBooking,
} from '@/modules/scheduling';
import { withOrgContext } from '@/shared/auth/session';
import {
  AppError,
  AuthorizationError,
  ConflictError,
  DomainRuleError,
  ValidationError,
} from '@/shared/errors';

export interface SchedulingFormState {
  error?: string;
  fieldErrors?: Record<string, string>;
  success?: boolean;
  confirmRequired?: boolean;
}

function formValue(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  if (value === null) return undefined;
  const text = String(value).trim();
  return text === '' ? undefined : text;
}

function mapValidationError(error: ValidationError): SchedulingFormState {
  const fieldErrors: Record<string, string> = {};
  for (const issue of error.issues) {
    if (issue.path) fieldErrors[issue.path] = issue.message;
  }
  return { error: error.message, fieldErrors };
}

async function mapAppError(error: unknown): Promise<SchedulingFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('scheduling');
  if (error instanceof ValidationError) return mapValidationError(error);
  if (error instanceof AuthorizationError) return { error: tErrors('notAllowed') };
  if (error instanceof ConflictError) {
    const key = error.messageKey.startsWith('scheduling.')
      ? error.messageKey.replace(/^scheduling\./, '')
      : null;
    return {
      error: key ? t(key as 'errors.bookingOverlap') : t('overlapWarning'),
      confirmRequired: Boolean(error.details?.confirmRequired),
    };
  }
  if (error instanceof DomainRuleError) {
    const key = error.messageKey.replace(/^scheduling\./, '');
    try {
      return { error: t(key as 'errors.unavailableOverlap') };
    } catch {
      return { error: error.message };
    }
  }
  if (error instanceof AppError) return { error: tErrors('unexpected') };
  throw error;
}

function revalidateScheduling() {
  revalidatePath('/scheduling');
}

export async function createBookingAction(
  _prev: SchedulingFormState,
  formData: FormData,
): Promise<SchedulingFormState> {
  const t = await getTranslations('scheduling');
  const employeeId = formValue(formData, 'employeeId');
  const startAt = formValue(formData, 'startAt');
  const endAt = formValue(formData, 'endAt');
  if (!employeeId) return { error: t('errors.employeeRequired') };
  if (!startAt || !endAt) return { error: t('errors.windowRequired') };

  try {
    await withOrgContext((context) =>
      createBooking(context, {
        employeeId,
        projectId: formValue(formData, 'projectId'),
        workOrderId: formValue(formData, 'workOrderId'),
        startAt,
        endAt,
        plannedHours: formValue(formData, 'plannedHours'),
        notes: formValue(formData, 'notes'),
        confirmConflict: formValue(formData, 'confirmConflict') === 'on',
      }),
    );
    revalidateScheduling();
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function updateBookingAction(
  _prev: SchedulingFormState,
  formData: FormData,
): Promise<SchedulingFormState> {
  const t = await getTranslations('scheduling');
  const bookingId = formValue(formData, 'bookingId');
  if (!bookingId) return { error: t('errors.windowRequired') };

  try {
    await withOrgContext((context) =>
      updateBooking(context, {
        bookingId,
        employeeId: formValue(formData, 'employeeId'),
        projectId: formValue(formData, 'projectId'),
        startAt: formValue(formData, 'startAt'),
        endAt: formValue(formData, 'endAt'),
        plannedHours: formValue(formData, 'plannedHours'),
        notes: formValue(formData, 'notes'),
        confirmConflict: formValue(formData, 'confirmConflict') === 'on',
      }),
    );
    revalidateScheduling();
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}

export async function cancelBookingAction(bookingId: string): Promise<{ error?: string; ok?: boolean }> {
  const tErrors = await getTranslations('errors');
  try {
    await withOrgContext((context) => cancelBooking(context, { bookingId }));
    revalidateScheduling();
    return { ok: true };
  } catch (error) {
    if (error instanceof AppError) {
      return { error: tErrors('unexpected') };
    }
    throw error;
  }
}

export async function createUnavailabilityAction(
  _prev: SchedulingFormState,
  formData: FormData,
): Promise<SchedulingFormState> {
  const t = await getTranslations('scheduling');
  const employeeId = formValue(formData, 'employeeId');
  const startDate = formValue(formData, 'startDate');
  const endDate = formValue(formData, 'endDate');
  if (!employeeId) return { error: t('errors.employeeRequired') };
  if (!startDate || !endDate) return { error: t('errors.windowRequired') };

  try {
    await withOrgContext((context) =>
      createUnavailability(context, {
        employeeId,
        startDate,
        endDate,
        kind: formValue(formData, 'kind') as 'leave' | 'unavailable' | 'holiday' | undefined,
        notes: formValue(formData, 'notes'),
      }),
    );
    revalidateScheduling();
    return { success: true };
  } catch (error) {
    return mapAppError(error);
  }
}
