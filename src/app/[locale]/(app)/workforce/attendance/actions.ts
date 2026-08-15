'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  clockAttendance,
  manualAttendanceEventSchema,
  recordManualAttendanceEvent,
  replaceAttendanceEvent,
  voidAttendanceDay,
  voidAttendanceEvent,
} from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';

export interface AttendanceActionState {
  error?: string;
  ok?: boolean;
}

function localDateTimeToIso(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim();
  // datetime-local → treat as local wall time; Date parses as local in browsers/Node.
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

async function mapAttendanceError(error: unknown): Promise<string> {
  const t = await getTranslations('workforce');
  const tErrors = await getTranslations('errors');

  if (error instanceof DomainRuleError) {
    const key = error.messageKey;
    if (key === 'workforce.errors.alreadyClockedIn') return t('errors.alreadyClockedIn');
    if (key === 'workforce.errors.notClockedIn') return t('errors.notClockedIn');
    if (key === 'workforce.errors.breakStartInvalid') return t('errors.breakStartInvalid');
    if (key === 'workforce.errors.breakEndInvalid') return t('errors.breakEndInvalid');
    if (key === 'workforce.errors.noLinkedEmployee') return t('errors.noLinkedEmployee');
    if (key === 'workforce.errors.attendanceSelfScope') return t('errors.attendanceSelfScope');
    if (key === 'workforce.errors.attendanceDayVoid') return t('errors.attendanceDayVoid');
    if (key === 'workforce.errors.attendanceEventVoided') return t('errors.attendanceEventVoided');
  }

  if (error instanceof ValidationError) return tErrors('validationFailed');
  if (error instanceof AppError) return tErrors('unexpected');
  throw error;
}

export async function clockInAction(
  _prev: AttendanceActionState,
  _formData: FormData,
): Promise<AttendanceActionState> {
  try {
    await withOrgContext((context) =>
      clockAttendance(context, { eventType: 'clock_in' }),
    );
    revalidatePath('/workforce/attendance');
    return { ok: true };
  } catch (error) {
    return { error: await mapAttendanceError(error) };
  }
}

export async function clockOutAction(
  _prev: AttendanceActionState,
  _formData: FormData,
): Promise<AttendanceActionState> {
  try {
    await withOrgContext((context) =>
      clockAttendance(context, { eventType: 'clock_out' }),
    );
    revalidatePath('/workforce/attendance');
    return { ok: true };
  } catch (error) {
    return { error: await mapAttendanceError(error) };
  }
}

export async function clockBreakStartAction(
  _prev: AttendanceActionState,
  _formData: FormData,
): Promise<AttendanceActionState> {
  try {
    await withOrgContext((context) =>
      clockAttendance(context, { eventType: 'break_start' }),
    );
    revalidatePath('/workforce/attendance');
    return { ok: true };
  } catch (error) {
    return { error: await mapAttendanceError(error) };
  }
}

export async function clockBreakEndAction(
  _prev: AttendanceActionState,
  _formData: FormData,
): Promise<AttendanceActionState> {
  try {
    await withOrgContext((context) =>
      clockAttendance(context, { eventType: 'break_end' }),
    );
    revalidatePath('/workforce/attendance');
    return { ok: true };
  } catch (error) {
    return { error: await mapAttendanceError(error) };
  }
}

export async function manualAttendanceAction(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const occurredAt = localDateTimeToIso(formData.get('occurredAtLocal'));
  if (!occurredAt) {
    const tErrors = await getTranslations('errors');
    return { error: tErrors('validationFailed') };
  }

  try {
    const parsed = manualAttendanceEventSchema.safeParse({
      employeeId: String(formData.get('employeeId') ?? ''),
      workDate: String(formData.get('workDate') ?? ''),
      eventType: String(formData.get('eventType') ?? ''),
      occurredAt,
      notes: String(formData.get('notes') ?? '') || null,
    });
    if (!parsed.success) {
      const tErrors = await getTranslations('errors');
      return { error: tErrors('validationFailed') };
    }

    await withOrgContext((context) => recordManualAttendanceEvent(context, parsed.data));
    revalidatePath('/workforce/attendance');
    return { ok: true };
  } catch (error) {
    return { error: await mapAttendanceError(error) };
  }
}

export async function voidAttendanceEventAction(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  try {
    await withOrgContext((context) =>
      voidAttendanceEvent(context, {
        eventId: String(formData.get('eventId') ?? ''),
        notes: String(formData.get('notes') ?? '') || null,
      }),
    );
    revalidatePath('/workforce/attendance');
    return { ok: true };
  } catch (error) {
    return { error: await mapAttendanceError(error) };
  }
}

export async function replaceAttendanceEventAction(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const occurredAt = localDateTimeToIso(formData.get('occurredAtLocal'));

  try {
    await withOrgContext((context) =>
      replaceAttendanceEvent(context, {
        eventId: String(formData.get('eventId') ?? ''),
        eventType: (() => {
          const raw = String(formData.get('eventType') ?? '').trim();
          if (
            raw === 'clock_in' ||
            raw === 'clock_out' ||
            raw === 'break_start' ||
            raw === 'break_end'
          ) {
            return raw;
          }
          return undefined;
        })(),
        occurredAt,
        notes: String(formData.get('notes') ?? '') || null,
      }),
    );
    revalidatePath('/workforce/attendance');
    return { ok: true };
  } catch (error) {
    return { error: await mapAttendanceError(error) };
  }
}

export async function voidAttendanceDayAction(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  try {
    await withOrgContext((context) =>
      voidAttendanceDay(context, {
        dayId: String(formData.get('dayId') ?? ''),
        notes: String(formData.get('notes') ?? '') || null,
      }),
    );
    revalidatePath('/workforce/attendance');
    return { ok: true };
  } catch (error) {
    return { error: await mapAttendanceError(error) };
  }
}
