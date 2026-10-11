'use server';

import { revalidatePath } from 'next/cache';
import { getTranslations } from 'next-intl/server';
import { withOrgContext } from '@/shared/auth/session';
import {
  listAttendanceCorrectionRequests,
  reviewAttendanceCorrectionRequest,
  submitAttendanceCorrectionRequest,
} from '@/modules/workforce/application/attendance-correction-requests';
import { mapServerActionError } from '@/shared/errors';
import type { BusinessDate } from '@/shared/dates';
import type { AttendanceCorrectionRequestActionState } from '@/modules/workforce/ui/attendance-correction-request-form';
import type { CorrectionRequestActionResult } from '@/modules/workforce/ui/attendance-correction-requests-panel';

function revalidateAttendancePaths() {
  revalidatePath('/workforce/attendance');
}

export async function submitAttendanceCorrectionRequestAction(
  _prev: AttendanceCorrectionRequestActionState,
  formData: FormData,
): Promise<AttendanceCorrectionRequestActionState> {
  try {
    await withOrgContext(async (context) => {
      const workDate = String(formData.get('workDate') ?? '');
      const requestedClockIn = String(formData.get('requestedClockIn') ?? '');
      const requestedClockOut = String(formData.get('requestedClockOut') ?? '');
      const reason = String(formData.get('reason') ?? '');
      const employeeIdRaw = formData.get('employeeId');
      await submitAttendanceCorrectionRequest(context, {
        employeeId: employeeIdRaw ? String(employeeIdRaw) : undefined,
        workDate: workDate as BusinessDate,
        requestedClockIn,
        requestedClockOut,
        reason,
      });
    });
    revalidateAttendancePaths();
    return { success: true };
  } catch (error) {
    const tErrors = await getTranslations('errors');
    const tWorkforce = await getTranslations('workforce');
    return mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
      namespaces: {
        workforce: (key) => tWorkforce(key as 'errors.emptyBulk'),
      },
      rethrowUnknown: false,
    });
  }
}

export async function approveAttendanceCorrectionAction(
  requestId: string,
  reviewerNote: string | null,
): Promise<CorrectionRequestActionResult> {
  try {
    await withOrgContext(async (context) => {
      await reviewAttendanceCorrectionRequest(context, {
        requestId,
        decision: 'approved',
        reviewerNote: reviewerNote ?? undefined,
      });
    });
    revalidateAttendancePaths();
    return {};
  } catch (error) {
    const tErrors = await getTranslations('errors');
    const tWorkforce = await getTranslations('workforce');
    const mapped = mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
      namespaces: {
        workforce: (key) => tWorkforce(key as 'errors.emptyBulk'),
      },
      rethrowUnknown: false,
    });
    return { error: mapped.error };
  }
}

export async function rejectAttendanceCorrectionAction(
  requestId: string,
  reviewerNote: string,
): Promise<CorrectionRequestActionResult> {
  try {
    await withOrgContext(async (context) => {
      await reviewAttendanceCorrectionRequest(context, {
        requestId,
        decision: 'rejected',
        reviewerNote,
      });
    });
    revalidateAttendancePaths();
    return {};
  } catch (error) {
    const tErrors = await getTranslations('errors');
    const tWorkforce = await getTranslations('workforce');
    const mapped = mapServerActionError(error, {
      tErrors: (key) => tErrors(key as 'unexpected'),
      namespaces: {
        workforce: (key) => tWorkforce(key as 'errors.emptyBulk'),
      },
      rethrowUnknown: false,
    });
    return { error: mapped.error };
  }
}

export async function loadPendingAttendanceCorrectionRequests() {
  return withOrgContext(async (context) => {
    const requests = await listAttendanceCorrectionRequests(context, { status: 'pending' });
    return requests;
  });
}
