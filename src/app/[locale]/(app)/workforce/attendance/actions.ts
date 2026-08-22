'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  applyManualAttendanceWorkdayRange,
  clockAttendance,
  manualAttendanceEventSchema,
  manualAttendanceWorkdayRangeSchema,
  recordManualAttendanceEvent,
  replaceAttendanceEvent,
  voidAttendanceDay,
  voidAttendanceEvent,
} from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError, ValidationError } from '@/shared/errors';

export interface AttendanceOverwriteSummaryState {
  employeeId: string;
  employeeName: string;
  fromDate: string;
  toDate: string;
  dayCount: number;
  existingCount: number;
  newCount: number;
  clockInTime: string;
  clockOutTime: string;
  workScope: 'general' | 'project';
  projectId: string | null;
}

export interface AttendanceActionState {
  error?: string;
  ok?: boolean;
  message?: string;
  warning?: string;
  createdCount?: number;
  updatedCount?: number;
  skippedExistingCount?: number;
  skippedVoidCount?: number;
  /** Server detected existing attendance — no mutation yet; UI must double-confirm. */
  needsOverwriteApproval?: boolean;
  overwriteSummary?: AttendanceOverwriteSummaryState;
}

function localDateTimeToIso(value: FormDataEntryValue | null): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const trimmed = value.trim();
  const parsed = new Date(trimmed);
  if (Number.isNaN(parsed.getTime())) return undefined;
  return parsed.toISOString();
}

function parseWeekdays(formData: FormData): number[] {
  return formData
    .getAll('weekdays')
    .map((value) => Number(value))
    .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
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
    if (key === 'workforce.errors.invalidBulkRange') return t('errors.invalidBulkRange');
    if (key === 'workforce.errors.emptyBulk') return t('errors.emptyBulk');
    if (key === 'workforce.errors.attendanceRangeAllExisting') {
      return t('errors.attendanceRangeAllExisting');
    }
    if (key === 'workforce.errors.attendanceClosedPeriod') {
      return t('errors.attendanceClosedPeriod');
    }
    if (key.startsWith('workforce.errors.')) {
      const short = key.slice('workforce.errors.'.length);
      try {
        return t(`errors.${short}` as 'errors.alreadyClockedIn');
      } catch {
        /* fall through */
      }
    }
  }

  if (error instanceof ValidationError) return tErrors('validationFailed');
  if (error instanceof AppError) return tErrors('unexpected');
  throw error;
}

async function mapWarningKey(key: string | null | undefined): Promise<string | undefined> {
  if (!key) return undefined;
  const t = await getTranslations('workforce');
  if (key === 'workforce.errors.attendanceProjectTimeFailed') {
    return t('errors.attendanceProjectTimeFailed');
  }
  if (key === 'workforce.errors.attendanceProjectTimeNoPermission') {
    return t('errors.attendanceProjectTimeNoPermission');
  }
  if (key === 'workforce.errors.attendanceProjectTimePendingApproval') {
    return t('errors.attendanceProjectTimePendingApproval');
  }
  if (key.startsWith('workforce.errors.')) {
    const short = key.slice('workforce.errors.'.length);
    try {
      return t(`errors.${short}` as 'errors.alreadyClockedIn');
    } catch {
      return t('errors.attendanceProjectTimeFailed');
    }
  }
  return t('errors.attendanceProjectTimeFailed');
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
  const entryMode = String(formData.get('entryMode') ?? 'single');
  if (entryMode === 'range') {
    return manualAttendanceRangeAction(_prev, formData);
  }

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

async function manualAttendanceRangeAction(
  _prev: AttendanceActionState,
  formData: FormData,
): Promise<AttendanceActionState> {
  const t = await getTranslations('workforce');
  const weekdays = parseWeekdays(formData);
  const overwriteConfirmed =
    String(formData.get('overwriteConfirmed') ?? '') === '1' ||
    String(formData.get('overwriteConfirmed') ?? '') === 'true' ||
    String(formData.get('overwriteConfirmed') ?? '') === 'on';
  const workScopeRaw = String(formData.get('workScope') ?? 'general');
  const workScope = workScopeRaw === 'project' ? 'project' : 'general';
  const projectIdRaw = String(formData.get('projectId') ?? '').trim();

  try {
    const parsed = manualAttendanceWorkdayRangeSchema.safeParse({
      employeeId: String(formData.get('employeeId') ?? ''),
      fromDate: String(formData.get('fromDate') ?? ''),
      toDate: String(formData.get('toDate') ?? ''),
      weekdays,
      clockInTime: String(formData.get('clockInTime') ?? ''),
      clockOutTime: String(formData.get('clockOutTime') ?? ''),
      notes: String(formData.get('notes') ?? '') || null,
      // Overwrite path is gated by overwriteConfirmed (Owner double approval), not a checkbox.
      updateExisting: overwriteConfirmed,
      overwriteConfirmed,
      workScope,
      projectId: workScope === 'project' && projectIdRaw ? projectIdRaw : null,
    });
    if (!parsed.success) {
      const tErrors = await getTranslations('errors');
      return { error: tErrors('validationFailed') };
    }

    const outcome = await withOrgContext((context) =>
      applyManualAttendanceWorkdayRange(context, parsed.data),
    );

    if (outcome.status === 'needs_overwrite_approval') {
      return {
        needsOverwriteApproval: true,
        overwriteSummary: outcome.summary,
      };
    }

    const result = outcome.result;
    revalidatePath('/workforce/attendance');
    revalidatePath('/workforce/time');
    revalidatePath('/workforce/time/approvals');
    revalidatePath('/workforce/time/new');
    revalidatePath('/dashboard');
    revalidatePath('/projects');
    if (parsed.data.projectId) {
      revalidatePath(`/projects/${parsed.data.projectId}`);
    }

    const parts: string[] = [
      t('attendance.manual.rangeSavedSimple', {
        saved: result.createdCount + result.updatedCount,
        skippedExisting: result.skippedExistingCount,
      }),
    ];
    if (result.projectTimeCreatedCount > 0) {
      parts.push(
        t('attendance.manual.projectTimeSaved', {
          count: result.projectTimeCreatedCount,
        }),
      );
    }
    if (result.projectTimeApprovedCount > 0) {
      parts.push(
        t('attendance.manual.projectTimeApproved', {
          count: result.projectTimeApprovedCount,
        }),
      );
    }
    if (result.projectTimePendingCount > 0) {
      parts.push(
        t('attendance.manual.projectTimePending', {
          count: result.projectTimePendingCount,
        }),
      );
    }
    if (result.projectTimeSkippedDuplicateCount > 0) {
      parts.push(
        t('attendance.manual.projectTimeSkipped', {
          count: result.projectTimeSkippedDuplicateCount,
        }),
      );
    }
    if (result.projectTimeVoidedPriorWorkCount > 0) {
      parts.push(
        t('attendance.manual.projectTimeReconciled', {
          count: result.projectTimeVoidedPriorWorkCount,
        }),
      );
    }

    return {
      ok: true,
      message: parts.join(' '),
      warning: await mapWarningKey(result.projectTimeWarningKey),
      createdCount: result.createdCount,
      updatedCount: result.updatedCount,
      skippedExistingCount: result.skippedExistingCount,
      skippedVoidCount: result.skippedVoidCount,
    };
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
