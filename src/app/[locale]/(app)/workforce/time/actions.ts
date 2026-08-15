'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  approveTimeEntry,
  approveTimesheet,
  bulkApproveTimeEntries,
  correctTimeEntry,
  correctTimeEntrySchema,
  createBulkTimeEntries,
  createBulkTimeEntriesSchema,
  createTimeEntry,
  createTimeEntrySchema,
  returnTimesheet,
  submitTimeEntries,
  submitTimesheet,
} from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface TimeEntryFormState {
  error?: string;
  ok?: boolean;
  /** Local draft queued — not server truth. */
  offlineQueued?: boolean;
}

const WORKFORCE_ERROR_KEYS = [
  'invalidBulkRange',
  'emptyBulk',
  'timeEntryAlreadyVoid',
  'timeEntryArchived',
  'invalidWorkPackage',
  'invalidPhase',
  'closedMonthNeedsProject',
  'closedMonthCurrencyMismatch',
  'invalidTimesheetTransition',
  'timesheetPeriodApproved',
  'timesheetEmployeeMismatch',
  'nothingToSubmit',
  'managerNoteRequired',
  'timeEntryApprovedLocked',
  'timeEntryNotEditable',
  'invalidTimesheetPeriod',
] as const;

async function mapActionError(error: unknown, fallback: string): Promise<TimeEntryFormState> {
  if (!(error instanceof AppError)) throw error;
  const prefix = 'workforce.errors.';
  if (error.messageKey.startsWith(prefix)) {
    const shortKey = error.messageKey.slice(prefix.length);
    if ((WORKFORCE_ERROR_KEYS as readonly string[]).includes(shortKey)) {
      const tWorkforce = await getTranslations('workforce');
      return { error: tWorkforce(`errors.${shortKey}` as 'errors.invalidBulkRange') };
    }
  }
  if (error.messageKey.startsWith('monthClose.')) {
    const tMonthClose = await getTranslations('monthClose');
    const key = error.messageKey.slice('monthClose.'.length);
    try {
      return { error: tMonthClose(key as 'errors.useCorrectionNotRewrite') };
    } catch {
      return { error: fallback };
    }
  }
  if (error.messageKey.startsWith('approvals.errors.')) {
    const tApprovals = await getTranslations('approvals');
    const shortKey = error.messageKey.slice('approvals.errors.'.length);
    return { error: tApprovals(`errors.${shortKey}` as 'errors.pending') };
  }
  return { error: fallback };
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
      revalidatePath('/workforce', 'layout');
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
      await withOrgContext((context) => createBulkTimeEntries(context, parsed.data));
      revalidatePath('/workforce', 'layout');
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
  });

  if (!parsed.success) {
    return { error: tErrors('validationFailed') };
  }

  try {
    await withOrgContext((context) => createTimeEntry(context, parsed.data));
    revalidatePath('/workforce', 'layout');
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
  try {
    await withOrgContext((context) =>
      employeeId
        ? submitTimesheet(context, { employeeId, entryIds: entryIds.length > 0 ? entryIds : undefined })
        : submitTimeEntries(context, { entryIds }),
    );
    revalidatePath('/workforce', 'layout');
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
    revalidatePath('/workforce', 'layout');
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
    revalidatePath('/workforce', 'layout');
    return { ok: true };
  } catch (error) {
    return mapActionError(error, fallback);
  }
}
