import { formatMoneyString } from '@/shared/money';

const FULL_MONTH_EN =
  /^Defined monthly employer cost ([0-9.]+); recognized full month ([0-9.]+)$/;
const ACCRUED_EN =
  /^Defined monthly employer cost ([0-9.]+); accrued to date ([0-9.]+) \((\d+) of ([0-9.]+) work days\)$/;

export type EmployerCostRecognitionNoteLabels = {
  readonly recognitionNoteFullMonth: (values: {
    defined: string;
    recognized: string;
  }) => string;
  readonly recognitionNoteAccrued: (values: {
    defined: string;
    recognized: string;
    days: number;
    workingDays: string;
  }) => string;
};

/**
 * Rewrite English auto-generated accrual notes (from describeMonthlyEmployerCostRecognition)
 * into locale copy with 2dp money display. Leaves owner-authored notes unchanged.
 */
export function localizeEmployerCostRecognitionNote(
  note: string | null | undefined,
  input: {
    readonly currency: string;
    readonly locale: string;
    readonly labels: EmployerCostRecognitionNoteLabels;
  },
): string {
  const trimmed = (note ?? '').trim();
  if (!trimmed) return '';

  const full = FULL_MONTH_EN.exec(trimmed);
  if (full) {
    const [, defined = '', recognized = ''] = full;
    return input.labels.recognitionNoteFullMonth({
      defined: formatMoneyString(defined, input.currency, input.locale),
      recognized: formatMoneyString(recognized, input.currency, input.locale),
    });
  }

  const accrued = ACCRUED_EN.exec(trimmed);
  if (accrued) {
    const [, defined = '', recognized = '', days = '0', workingDays = ''] = accrued;
    return input.labels.recognitionNoteAccrued({
      defined: formatMoneyString(defined, input.currency, input.locale),
      recognized: formatMoneyString(recognized, input.currency, input.locale),
      days: Number(days),
      workingDays,
    });
  }

  return trimmed;
}
