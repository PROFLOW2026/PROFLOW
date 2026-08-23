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
  ConflictError,
  mapServerActionError,
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

async function mapAppError(error: unknown): Promise<SchedulingFormState> {
  const tErrors = await getTranslations('errors');
  const t = await getTranslations('scheduling');
  if (error instanceof ConflictError) {
    const mapped = mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
      namespaces: {
        scheduling: (key) => t(key as 'errors.bookingOverlap'),
      },
    });
    return {
      error: error.messageKey.startsWith('scheduling.') ? mapped.error : t('overlapWarning'),
      confirmRequired: Boolean(error.details?.confirmRequired),
    };
  }
  return mapServerActionError(error, {
    tErrors: (key) => tErrors(key as 'unexpected'),
    namespaces: {
      scheduling: (key) => t(key as 'errors.unavailableOverlap'),
    },
  });
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
  try {
    await withOrgContext((context) => cancelBooking(context, { bookingId }));
    revalidateScheduling();
    return { ok: true };
  } catch (error) {
    return mapAppError(error);
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
