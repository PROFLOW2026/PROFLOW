'use server';

import { revalidatePath } from 'next/cache';
import {
  addDailyLogEntry,
  closeDailyLog,
  recordContractorDailyReport,
  removeDailyLogEntry,
  reopenDailyLog,
  updateDailyLogHeader,
} from '@/modules/site-log';
import {
  FIELD_ACTION_OK,
  mapFieldActionError,
  type FieldActionState,
} from '@/modules/site-log/shared/action-state';
import { formDataToObject } from '@/modules/site-log/shared/validation';
import { withOrgContext } from '@/shared/auth/session';

function revalidateDay(projectId: string, logDate: string) {
  revalidatePath(`/projects/${projectId}/site-log`);
  revalidatePath(`/projects/${projectId}/site-log/${logDate}`);
}

export async function saveDailyLogHeaderAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  try {
    await withOrgContext((context) =>
      updateDailyLogHeader(context, {
        projectId: input.projectId ?? '',
        logDate: input.logDate ?? '',
        weather: input.weather,
        notes: input.notes,
      }),
    );
    revalidateDay(input.projectId ?? '', input.logDate ?? '');
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}

function splitParty(value: string | undefined): { vendorId: string | null; subcontractAgreementId: string | null } {
  if (!value) return { vendorId: null, subcontractAgreementId: null };
  const [vendorId, agreementId] = value.split(':');
  return { vendorId: vendorId || null, subcontractAgreementId: agreementId || null };
}

export async function addDailyLogEntryAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  try {
    await withOrgContext((context) =>
      addDailyLogEntry(context, {
        projectId: input.projectId ?? '',
        logDate: input.logDate ?? '',
        entryType: input.entryType as never,
        ...splitParty(input.party),
        locationId: input.locationId,
        description: input.description,
        headcount: input.headcount,
        hours: input.hours,
        quantity: input.quantity,
        unit: input.unit,
      }),
    );
    revalidateDay(input.projectId ?? '', input.logDate ?? '');
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}

export async function removeDailyLogEntryAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  try {
    await withOrgContext((context) =>
      removeDailyLogEntry(context, { projectId: input.projectId ?? '', entryId: input.entryId ?? '' }),
    );
    revalidateDay(input.projectId ?? '', input.logDate ?? '');
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}

export async function setDailyLogClosedAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  const key = { projectId: input.projectId ?? '', logDate: input.logDate ?? '' };
  try {
    await withOrgContext((context) => (input.intent === 'reopen' ? reopenDailyLog(context, key) : closeDailyLog(context, key)));
    revalidateDay(key.projectId, key.logDate);
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}

export async function recordContractorReportAction(_prev: FieldActionState, formData: FormData): Promise<FieldActionState> {
  const input = formDataToObject(formData);
  const party = splitParty(input.party);
  try {
    await withOrgContext((context) =>
      recordContractorDailyReport(context, {
        projectId: input.projectId ?? '',
        vendorId: party.vendorId ?? '',
        subcontractAgreementId: party.subcontractAgreementId,
        reportDate: input.reportDate ?? '',
        locationId: input.locationId,
        manpowerCount: input.manpowerCount,
        workPerformed: input.workPerformed,
        equipment: input.equipment,
        deliveries: input.deliveries,
        delays: input.delays,
        blockingIssues: input.blockingIssues,
        safetyNotes: input.safetyNotes,
        notes: input.notes,
      }),
    );
    revalidateDay(input.projectId ?? '', input.reportDate ?? '');
    return FIELD_ACTION_OK();
  } catch (error) {
    return mapFieldActionError(error);
  }
}
