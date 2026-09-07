'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  saveAttendanceOutcome,
  saveAttendanceOutcomeRange,
  type AbsenceReason,
} from '@/modules/workforce/application/attendance-outcomes';
import { recomputeDerivedLaborAfterAttendanceOutcomeChange } from '@/modules/workforce/application/monthly-cost-recompute';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError } from '@/shared/errors';
import { businessDate, isBusinessDate } from '@/shared/dates';

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
        const from = businessDate(fromDate);
        const to = businessDate(toDate);
        const count = await saveAttendanceOutcomeRange(context, {
          employeeId,
          fromDate: from,
          toDate: to,
          outcome,
          absenceReason: outcome === 'not_worked' ? absenceReason : null,
          absenceCompensation: outcome === 'not_worked' ? absenceCompensation : null,
          notes,
        });
        await recomputeDerivedLaborAfterAttendanceOutcomeChange(context, {
          employeeId,
          fromDate: from,
          toDate: to,
        });
        return count;
      }

      const workDate = String(formData.get('workDate') ?? '');
      if (!isBusinessDate(workDate)) {
        throw new DomainRuleError('Invalid work date', 'workforce.errors.invalidBulkRange');
      }
      const date = businessDate(workDate);
      await saveAttendanceOutcome(context, {
        employeeId,
        workDate: date,
        outcome,
        absenceReason: outcome === 'not_worked' ? absenceReason : null,
        absenceCompensation: outcome === 'not_worked' ? absenceCompensation : null,
        notes,
      });
      await recomputeDerivedLaborAfterAttendanceOutcomeChange(context, {
        employeeId,
        fromDate: date,
        toDate: date,
      });
      return 1;
    });

    revalidatePath('/workforce/attendance');
    revalidatePath('/workforce/attendance/monthly');
    revalidatePath('/today');
    revalidatePath('/notifications');
    return { ok: true, savedCount };
  } catch (error) {
    if (error instanceof DomainRuleError) {
      const t = await getTranslations('workforce');
      const key = error.messageKey;
      if (key === 'workforce.errors.attendanceClosedPeriod') return { error: t('errors.attendanceClosedPeriod') };
      if (key === 'workforce.errors.monthCostClosed') return { error: t('errors.monthCostClosed') };
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
