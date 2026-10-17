'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import {
  saveAttendanceOutcome,
  saveAttendanceOutcomeRange,
} from '@/modules/workforce/application/attendance-outcomes';
import { recomputeDerivedLaborAfterAttendanceOutcomeChange } from '@/modules/workforce/application/monthly-cost-recompute';
import { withOrgContext } from '@/shared/auth/session';
import { AppError, DomainRuleError } from '@/shared/errors';
import { businessDate, isBusinessDate } from '@/shared/dates';
import {
  AttendanceOutcomeFormValidationError,
  parseAttendanceOutcomeFormPayload,
} from '@/app/[locale]/(app)/workforce/attendance/parse-attendance-outcome-form-payload';

export interface AttendanceOutcomeActionState {
  ok?: boolean;
  error?: string;
  warning?: string;
  savedCount?: number;
}

export async function attendanceOutcomeAction(
  _prev: AttendanceOutcomeActionState,
  formData: FormData,
): Promise<AttendanceOutcomeActionState> {
  const tErrors = await getTranslations('errors');
  const tWorkforce = await getTranslations('workforce');

  let payload;
  try {
    payload = parseAttendanceOutcomeFormPayload(formData);
  } catch (error) {
    if (error instanceof AttendanceOutcomeFormValidationError) {
      return { error: tWorkforce('errors.absenceCompensationRequired') };
    }
    return { error: tErrors('validationFailed') };
  }

  const { employeeId, entryMode, outcome, absenceReason, absenceCompensation, notes } = payload;

  if (!employeeId) return { error: tErrors('validationFailed') };

  try {
    const saved = await withOrgContext(async (context) => {
      if (entryMode === 'range') {
        const fromDate = payload.fromDate ?? '';
        const toDate = payload.toDate ?? '';
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
        return { savedCount: count, fromDate: from, toDate: to };
      }

      const workDate = payload.workDate ?? '';
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
      return { savedCount: 1, fromDate: date, toDate: date };
    });

    let costPending = false;
    try {
      await withOrgContext(async (context) => {
        await recomputeDerivedLaborAfterAttendanceOutcomeChange(context, {
          employeeId,
          fromDate: saved.fromDate,
          toDate: saved.toDate,
        });
      });
    } catch (recomputeError) {
      console.error('[attendance outcome cost recompute pending]', recomputeError);
      costPending = true;
    }

    revalidatePath('/workforce/attendance');
    revalidatePath('/workforce/attendance/monthly');
    revalidatePath('/today');
    revalidatePath('/notifications');
    return {
      ok: true,
      savedCount: saved.savedCount,
      warning: costPending ? tWorkforce('attendance.manual.costRecomputePending') : undefined,
    };
  } catch (error) {
    if (error instanceof DomainRuleError) {
      const t = await getTranslations('workforce');
      const key = error.messageKey;
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
