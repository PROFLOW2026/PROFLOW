'use server';

import { revalidatePath } from 'next/cache';
import { requireExternalContext } from '@/modules/contractor-access';
import { submitContractorDailyReport } from '@/modules/site-log';
import {
  FIELD_ACTION_OK,
  mapFieldActionError,
  type FieldActionState,
} from '@/modules/site-log/shared/action-state';
import { formDataToObject } from '@/modules/site-log/shared/validation';
import { todayInTimeZone } from '@/shared/dates';

/** Earliest-ahead time zone on Earth: a date that is "today" anywhere is never rejected as future. */
const LATEST_TIME_ZONE = 'Pacific/Kiritimati';

export async function submitDailyReportAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  const [vendorId, agreementId] = (input.party ?? '').split(':');
  try {
    const context = await requireExternalContext();
    await submitContractorDailyReport(
      context,
      {
        projectId: input.projectId ?? '',
        vendorId: vendorId || null,
        subcontractAgreementId: agreementId || null,
        reportDate: input.reportDate ?? '',
        manpowerCount: input.manpowerCount,
        workPerformed: input.workPerformed,
        equipment: input.equipment,
        deliveries: input.deliveries,
        delays: input.delays,
        blockingIssues: input.blockingIssues,
        safetyNotes: input.safetyNotes,
        notes: input.notes,
      },
      todayInTimeZone(LATEST_TIME_ZONE),
    );
    revalidatePath(`/contractor/projects/${input.projectId}/site-log`);
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}
