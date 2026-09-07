import type { AbsenceReason } from '@/modules/workforce/application/attendance-outcomes';

export type AttendanceOutcomeFormPayload = {
  readonly employeeId: string;
  readonly entryMode: 'single' | 'range';
  readonly outcome: 'worked' | 'not_worked';
  readonly absenceReason: AbsenceReason | null;
  readonly absenceCompensation: 'paid' | 'unpaid' | null;
  readonly notes: string | null;
  readonly workDate: string | null;
  readonly fromDate: string | null;
  readonly toDate: string | null;
};

export class AttendanceOutcomeFormValidationError extends Error {
  readonly messageKey = 'workforce.errors.absenceCompensationRequired' as const;
}

/** Parse attendance outcome form fields — no silent paid default for not_worked. */
export function parseAttendanceOutcomeFormPayload(formData: FormData): AttendanceOutcomeFormPayload {
  const employeeId = String(formData.get('employeeId') ?? '').trim();
  const entryModeRaw = String(formData.get('entryMode') ?? 'single');
  const entryMode = entryModeRaw === 'range' ? 'range' : 'single';
  const outcome = formData.get('outcome') === 'not_worked' ? 'not_worked' : 'worked';
  const absenceReason = outcome === 'not_worked' ? parseAbsenceReason(formData.get('absenceReason')) : null;
  const absenceCompensation =
    outcome === 'not_worked' ? parseAbsenceCompensation(formData.get('absenceCompensation'), absenceReason) : null;
  const notes = String(formData.get('notes') ?? '').trim() || null;

  return {
    employeeId,
    entryMode,
    outcome,
    absenceReason,
    absenceCompensation,
    notes,
    workDate: String(formData.get('workDate') ?? '').trim() || null,
    fromDate: String(formData.get('fromDate') ?? '').trim() || null,
    toDate: String(formData.get('toDate') ?? '').trim() || null,
  };
}

export function parseAbsenceReason(value: FormDataEntryValue | null): AbsenceReason {
  const raw = String(value ?? '').trim();
  if (raw === 'unpaid_leave' || raw === 'vacation' || raw === 'sick' || raw === 'rest_day') {
    return raw;
  }
  if (raw === 'other') return 'other';
  return 'other';
}

export function parseAbsenceCompensation(
  value: FormDataEntryValue | null,
  absenceReason: AbsenceReason | null,
): 'paid' | 'unpaid' {
  const raw = String(value ?? '').trim();
  if (raw !== 'paid' && raw !== 'unpaid') {
    throw new AttendanceOutcomeFormValidationError();
  }
  if (absenceReason === 'unpaid_leave') return 'unpaid';
  return raw;
}
