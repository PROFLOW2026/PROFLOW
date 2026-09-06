'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  saveAttendanceOutcome,
  saveAttendanceOutcomeRange,
  type AbsenceReason,
} from '@/modules/workforce/application/attendance-outcomes';
import { recomputeMonthlyEmployeeCostForOpenMonth } from '@/modules/workforce/application/monthly-cost-recompute';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError } from '@/shared/errors';
import { businessDate, isBusinessDate, type BusinessDate } from '@/shared/dates';
import type { OrgContext } from '@/shared/auth/context';

export interface AttendanceOutcomeActionState {
  ok?: boolean;
  error?: string;
  savedCount?: number;
}

export async function attendanceOutcomeAction(
  _prev: AttendanceOutcomeActionState,
  formData: FormData,
): Promise<AttendanceOutcomeActionState> {
  const tErrors = await getTranslations('errors');
  const employeeId = String(formData.get('employeeId') ?? '').trim();
  const entryMode = String(formData.get('entryMode') ?? 'single');
  const outcome = formData.get('outcome') === 'not_worked' ? 'not_worked' : 'worked';
  const absenceReason = parseAbsenceReason(formData.get('absenceReason'));
  const absenceCompensation =
    formData.get('absenceCompensation') === 'unpaid' ? 'unpaid' : 'paid';
  const notes = String(formData.get('notes') ?? '').trim() || null;

  if (!employeeId) return { error: tErrors('validationFailed') };

  try {
    const savedCount = await withOrgContext(async (context) => {
      if (entryMode === 'range') {
        const fromDate = String(formData.get('fromDate') ?? '');
        const toDate = String(formData.get('toDate') ?? '');
        if (!isBusinessDate(fromDate) || !isBusinessDate(toDate)) {
          throw new DomainRuleError('Invalid date range', 'workforce.errors.invalidBulkRange');
        }
        const count = await saveAttendanceOutcomeRange(context, {
          employeeId,
          fromDate: businessDate(fromDate),
          toDate: businessDate(toDate),
          outcome,
          absenceReason: outcome === 'not_worked' ? absenceReason : null,
          absenceCompensation: outcome === 'not_worked' ? absenceCompensation : null,
          notes,
        });
        await recomputeForRange(context, employeeId, fromDate, toDate);
        return count;
      }

      const workDate = String(formData.get('workDate') ?? '');
      if (!isBusinessDate(workDate)) {
        throw new DomainRuleError('Invalid work date', 'workforce.errors.invalidBulkRange');
      }
      await saveAttendanceOutcome(context, {
        employeeId,
        workDate: businessDate(workDate),
        outcome,
        absenceReason: outcome === 'not_worked' ? absenceReason : null,
        absenceCompensation: outcome === 'not_worked' ? absenceCompensation : null,
        notes,
      });
      await recomputeMonthlyEmployeeCostForOpenMonth(context, {
        employeeId,
        yearMonth: workDate.slice(0, 7),
      });
      return 1;
    });

    revalidatePath('/workforce/attendance');
    revalidatePath('/workforce/attendance/monthly');
    return { ok: true, savedCount };
  } catch (error) {
    if (error instanceof DomainRuleError) {
      const t = await getTranslations('workforce');
      const key = error.messageKey;
      if (key === 'workforce.errors.attendanceClosedPeriod') return { error: t('errors.attendanceClosedPeriod') };
      if (key === 'workforce.errors.invalidBulkRange') return { error: t('errors.invalidBulkRange') };
      if (key.startsWith('workforce.errors.')) {
        const short = key.slice('workforce.errors.'.length);
        try {
          return { error: t(`errors.${short}` as 'errors.alreadyClockedIn') };
        } catch {
          /* fall through */
        }
      }
    }
    if (error instanceof AppError) return { error: tErrors('validationFailed') };
    console.error('[attendance outcome action]', error);
    return { error: tErrors('unexpected') };
  }
}

function parseAbsenceReason(value: FormDataEntryValue | null): AbsenceReason {
  const raw = String(value ?? 'other');
  if (raw === 'unpaid_leave' || raw === 'vacation' || raw === 'sick' || raw === 'rest_day') {
    return raw;
  }
  return 'other';
}

async function recomputeForRange(
  context: OrgContext,
  employeeId: string,
  fromDate: BusinessDate,
  toDate: BusinessDate,
): Promise<void> {
  const months = new Set<string>();
  const start = new Date(`${fromDate}T12:00:00Z`);
  const end = new Date(`${toDate}T12:00:00Z`);
  for (let d = start; d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    months.add(d.toISOString().slice(0, 7));
  }
  for (const yearMonth of months) {
    await recomputeMonthlyEmployeeCostForOpenMonth(context, { employeeId, yearMonth });
  }
}
