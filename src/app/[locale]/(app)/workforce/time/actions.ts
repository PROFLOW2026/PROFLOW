'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  approveTimeEntry,
  approveTimeEntryExcess,
  rejectTimeEntryExcess,
  approveTimesheet,
  bulkApproveTimeEntries,
  correctTimeEntry,
  correctTimeEntrySchema,
  createBulkTimeEntries,
  createBulkTimeEntriesSchema,
  createTimeEntry,
  createTimeEntrySchema,
  deleteDraftTimeEntry,
  excessTimeEntryDecisionSchema,
  returnTimesheet,
  submitTimeEntries,
  submitTimesheet,
  updateTimeEntry,
  updateTimeEntrySchema,
  purgeExactDuplicateDrafts,
} from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { businessDate } from '@/shared/dates';
import { redirect } from '@/shared/i18n/navigation';
import {
  isRedirectError,
  mapWorkforceActionError,
} from '@/modules/workforce/application/map-workforce-action-error';

export interface TimeEntryFormState {
  error?: string;
  ok?: boolean;
  removedCount?: number;
  createdCount?: number;
  skippedDuplicateCount?: number;
  /** Local draft queued - not server truth. */
  offlineQueued?: boolean;
  /** Daily framework excess — user must confirm before resubmit. */
  dailyExcessWarning?: {
    readonly standardHoursPerDay: string;
    readonly reportedSoFar: string;
    readonly newHours: string;
    readonly excessHours: string;
  };
}

async function mapActionError(error: unknown, fallback: string): Promise<TimeEntryFormState> {
  if (isRedirectError(error)) throw error;
  return mapWorkforceActionError(error, fallback);
}

/** Workforce time mutations must refresh Project Actual / workforce surfaces too. */
function revalidateWorkforceProjectSurfaces(projectId?: string | null) {
  revalidateWorkforceProjectSurfaces();
  revalidatePath('/projects', 'layout');
  revalidatePath('/dashboard');
  if (projectId) {
    revalidatePath(`/projects/${projectId}`);
  }
}

function parseDayHours(raw: FormDataEntryValue | null): { workDate: string; hours: string }[] | undefined {
  if (typeof raw !== 'string' || !raw.trim()) return undefined;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return undefined;
    return parsed
      .filter(
        (row): row is { workDate: string; hours: string } =>
          typeof row === 'object' &&
          row !== null &&
          typeof (row as { workDate?: unknown }).workDate === 'string' &&
          typeof (row as { hours?: unknown }).hours === 'string',
      )
      .map((row) => ({ workDate: row.workDate, hours: row.hours }));
  } catch {
    return undefined;
  }
}

function parseWeekdays(formData: FormData): number[] | undefined {
  const values = formData.getAll('weekdays').flatMap((value) => {
    if (typeof value !== 'string') return [];
    return value
      .split(',')
      .map((part) => Number(part.trim()))
      .filter((day) => Number.isInteger(day) && day >= 0 && day <= 6);
  });
  return values.length > 0 ? [...new Set(values)] : undefined;
}

function parseIdList(formData: FormData, name: string): string[] {
  return formData
    .getAll(name)
    .flatMap((value) => (typeof value === 'string' ? value.split(',') : []))
    .map((value) => value.trim())
    .filter(Boolean);
}

export async function createTimeEntryAction(
  _prevState: TimeEntryFormState,
  formData: FormData,
): Promise<TimeEntryFormState> {
  const tErrors = await getTranslations('errors');
  const locale = await getLocale();
  const fallback = tErrors('unexpected');

  const mode = String(formData.get('entryMode') ?? 'single');
  const correctsEntryId = formData.get('correctsEntryId');

  if (typeof correctsEntryId === 'string' && correctsEntryId.trim()) {
    const parsed = correctTimeEntrySchema.safeParse({
      correctsEntryId: correctsEntryId.trim(),
      employeeId: formData.get('employeeId'),
      workDate: formData.get('workDate') || formData.get('fromDate'),
      hours: formData.get('hours'),
      kind: formData.get('kind') ?? 'project',
      projectId: formData.get('projectId') || null,
      workPackageId: formData.get('workPackageId') || null,
      phaseId: formData.get('phaseId') || null,
      timeCodeId: formData.get('timeCodeId') || null,
      description: formData.get('description') || null,
    });
    if (!parsed.success) return { error: tErrors('validationFailed') };
    try {
      await withOrgContext((context) => correctTimeEntry(context, parsed.data));
      revalidateWorkforceProjectSurfaces();
      redirect({ href: '/workforce/time', locale });
    } catch (error) {
      return mapActionError(error, fallback);
    }
  }

  if (mode === 'bulk') {
    const parsed = createBulkTimeEntriesSchema.safeParse({
      employeeId: formData.get('employeeId'),
      fromDate: formData.get('fromDate') || formData.get('workDate'),
      toDate: formData.get('toDate') || formData.get('fromDate') || formData.get('workDate'),
      hours: formData.get('hours') || undefined,
      weekdays: parseWeekdays(formData),
      dayHours: parseDayHours(formData.get('dayHoursJson')),
      kind: formData.get('kind') ?? 'project',
      projectId: formData.get('projectId') || null,
      workPackageId: formData.get('workPackageId') || null,
      phaseId: formData.get('phaseId') || null,
      timeCodeId: formData.get('timeCodeId') || null,
      description: formData.get('description') || null,
    });
    if (!parsed.success) return { error: tErrors('validationFailed') };
    try {
      const result = await withOrgContext((context) => createBulkTimeEntries(context, parsed.data));
      revalidateWorkforceProjectSurfaces();
      if (result.entries.length === 0 && result.skippedDuplicateCount > 0) {
        const tWorkforce = await getTranslations('workforce');
        return {
          error: tWorkforce('errors.bulkAllDuplicates'),
          skippedDuplicateCount: result.skippedDuplicateCount,
        };
      }
      if (result.skippedDuplicateCount > 0) {
        const tWorkforce = await getTranslations('workforce');
        return {
          ok: true,
          createdCount: result.entries.length,
          skippedDuplicateCount: result.skippedDuplicateCount,
          error: tWorkforce('time.form.bulkPartialSuccess', {
            created: result.entries.length,
            skipped: result.skippedDuplicateCount,
          }),
        };
      }
      redirect({ href: '/workforce/time', locale });
    } catch (error) {
      return mapActionError(error, fallback);
    }
  }

  const parsed = createTimeEntrySchema.safeParse({
    employeeId: formData.get('employeeId'),
    workDate: formData.get('workDate'),
    hours: formData.get('hours'),
    kind: formData.get('kind') ?? 'project',
    projectId: formData.get('projectId') || null,
    workPackageId: formData.get('workPackageId') || null,
    phaseId: formData.get('phaseId') || null,
    timeCodeId: formData.get('timeCodeId') || null,
    description: formData.get('description') || null,
    confirmDailyExcess: formData.get('confirmDailyExcess') === 'on',
    approveOnCreate: formData.get('approveOnCreate') === 'on',
    clientRequestId: formData.get('clientRequestId') || null,
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) => createTimeEntry(context, parsed.data));
    revalidateWorkforceProjectSurfaces();
    redirect({ href: '/workforce/time', locale });
  } catch (error) {
    return mapActionError(error, fallback);
  }
}

export async function submitTimeEntriesAction(
  _prevState: TimeEntryFormState,
  formData: FormData,
): Promise<TimeEntryFormState> {
  const tErrors = await getTranslations('errors');
  const fallback = tErrors('unexpected');
  const entryIds = parseIdList(formData, 'entryIds');
  const employeeId = String(formData.get('employeeId') ?? '');
  const periodStartRaw = String(formData.get('periodStart') ?? '').trim();
  const periodStart = periodStartRaw ? businessDate(periodStartRaw) : undefined;
  try {
    await withOrgContext((context) =>
      employeeId
        ? submitTimesheet(context, {
            employeeId,
            entryIds: entryIds.length > 0 ? entryIds : undefined,
            periodStart,
          })
        : submitTimeEntries(context, { entryIds }),
    );
    revalidateWorkforceProjectSurfaces();
    return { ok: true };
  } catch (error) {
    return mapActionError(error, fallback);
  }
}

export async function approveTimesheetAction(
  _prevState: TimeEntryFormState,
  formData: FormData,
): Promise<TimeEntryFormState> {
  const tErrors = await getTranslations('errors');
  const fallback = tErrors('unexpected');
  const timesheetId = String(formData.get('timesheetId') ?? '');
  const timeEntryId = String(formData.get('timeEntryId') ?? '');
  const entryIds = parseIdList(formData, 'entryIds');
  try {
    await withOrgContext(async (context) => {
      if (timesheetId) {
        await approveTimesheet(context, { timesheetId });
        return;
      }
      if (entryIds.length > 0) {
        await bulkApproveTimeEntries(context, { timeEntryIds: entryIds });
        return;
      }
      if (timeEntryId) {
        await approveTimeEntry(context, { timeEntryId });
      }
    });
    revalidateWorkforceProjectSurfaces();
    return { ok: true };
  } catch (error) {
    return mapActionError(error, fallback);
  }
}

export async function returnTimesheetAction(
  _prevState: TimeEntryFormState,
  formData: FormData,
): Promise<TimeEntryFormState> {
  const tErrors = await getTranslations('errors');
  const fallback = tErrors('unexpected');
  const timesheetId = String(formData.get('timesheetId') ?? '');
  const managerNote = String(formData.get('managerNote') ?? '');
  try {
    await withOrgContext((context) => returnTimesheet(context, { timesheetId, managerNote }));
    revalidateWorkforceProjectSurfaces();
    return { ok: true };
  } catch (error) {
    return mapActionError(error, fallback);
  }
}

export async function deleteDraftTimeEntryAction(
  _prevState: TimeEntryFormState,
  formData: FormData,
): Promise<TimeEntryFormState> {
  const tErrors = await getTranslations('errors');
  const fallback = tErrors('unexpected');
  const timeEntryId = String(formData.get('timeEntryId') ?? '');
  try {
    await withOrgContext((context) => deleteDraftTimeEntry(context, { timeEntryId }));
    revalidateWorkforceProjectSurfaces();
    return { ok: true };
  } catch (error) {
    return mapActionError(error, fallback);
  }
}

export async function purgeExactDuplicateDraftsAction(
  _prevState: TimeEntryFormState,
  formData: FormData,
): Promise<TimeEntryFormState> {
  const tErrors = await getTranslations('errors');
  const fallback = tErrors('unexpected');
  try {
    const result = await withOrgContext((context) =>
      purgeExactDuplicateDrafts(context, {
        employeeId: String(formData.get('employeeId') || '') || undefined,
        projectId: String(formData.get('projectId') || '') || undefined,
        fromDate: (() => {
          const raw = String(formData.get('fromDate') || '').trim();
          return raw ? businessDate(raw) : undefined;
        })(),
        toDate: (() => {
          const raw = String(formData.get('toDate') || '').trim();
          return raw ? businessDate(raw) : undefined;
        })(),
      }),
    );
    revalidateWorkforceProjectSurfaces();
    return { ok: true, removedCount: result.removedCount };
  } catch (error) {
    return mapActionError(error, fallback);
  }
}

export async function excessTimeEntryDecisionAction(
  _prevState: TimeEntryFormState,
  formData: FormData,
): Promise<TimeEntryFormState> {
  const tErrors = await getTranslations('errors');
  const fallback = tErrors('unexpected');
  const decision = String(formData.get('decision') ?? '');
  const parsed = excessTimeEntryDecisionSchema.safeParse({
    timeEntryId: formData.get('timeEntryId'),
    managerNote: formData.get('managerNote') || null,
  });
  if (!parsed.success) return { error: tErrors('validationFailed') };
  try {
    await withOrgContext(async (context) => {
      if (decision === 'approve') {
        await approveTimeEntryExcess(context, parsed.data);
        return;
      }
      if (decision === 'reject') {
        await rejectTimeEntryExcess(context, parsed.data);
        return;
      }
      throw new Error('Unknown excess decision');
    });
    revalidateWorkforceProjectSurfaces();
    return { ok: true };
  } catch (error) {
    return mapActionError(error, fallback);
  }
}

export async function updateTimeEntryAction(
  _prevState: TimeEntryFormState,
  formData: FormData,
): Promise<TimeEntryFormState> {
  const tErrors = await getTranslations('errors');
  const fallback = tErrors('unexpected');
  const parsed = updateTimeEntrySchema.safeParse({
    timeEntryId: formData.get('timeEntryId'),
    hours: formData.get('hours') || undefined,
    description: formData.has('description') ? formData.get('description') || null : undefined,
  });
  if (!parsed.success) return { error: tErrors('validationFailed') };
  try {
    await withOrgContext((context) => updateTimeEntry(context, parsed.data));
    revalidateWorkforceProjectSurfaces();
    return { ok: true };
  } catch (error) {
    return mapActionError(error, fallback);
  }
}
