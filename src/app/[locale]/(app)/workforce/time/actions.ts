'use server';

import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';
import {
  correctTimeEntry,
  correctTimeEntrySchema,
  createBulkTimeEntries,
  createBulkTimeEntriesSchema,
  createTimeEntry,
  createTimeEntrySchema,
} from '@/modules/workforce';
import { withOrgContext } from '@/shared/auth/session';
import { AppError } from '@/shared/errors';
import { redirect } from '@/shared/i18n/navigation';

export interface TimeEntryFormState {
  error?: string;
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
    return {};
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
    return {};
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

  return {};
}
