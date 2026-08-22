import { getTranslations } from 'next-intl/server';
import { ValidationError, isAppError, type AppError } from '@/shared/errors';

const WORKFORCE_ERROR_KEYS = [
  'invalidBulkRange',
  'emptyBulk',
  'bulkAllDuplicates',
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
  'timeSelfScope',
  'selfApprovalBlocked',
  'noLinkedEmployee',
  'exactDuplicateTimeEntry',
  'dailyHoursExceeded',
  'timeEntryNotDeletable',
  'duplicateTeamMember',
  'userAlreadyLinked',
  'userNotInOrganization',
  'noExcessHours',
  'excessDecisionFailed',
  'excessExceedsEntryHours',
  'excessStatusRequired',
  'invalidHours',
  'timesheetPeriodLocked',
] as const;

export type WorkforceActionErrorState = {
  error?: string;
  dailyExcessWarning?: {
    readonly standardHoursPerDay: string;
    readonly reportedSoFar: string;
    readonly newHours: string;
    readonly excessHours: string;
  };
};

/**
 * Maps AppError / known conflicts to Hebrew UI. Never returns generic
 * "משהו השתבש" when a messageKey is available.
 */
export async function mapWorkforceActionError(
  error: unknown,
  fallback: string,
): Promise<WorkforceActionErrorState> {
  if (!isAppError(error)) {
    // Postgres / trigger messages Owner should not see raw — map common patterns.
    const text = error instanceof Error ? error.message : String(error);
    if (/closed_period_immutable|month is closed|closed month/i.test(text)) {
      const tMonthClose = await getTranslations('monthClose');
      return { error: tMonthClose('errors.useCorrectionNotRewrite') };
    }
    if (/approved time is locked|cost snapshot fill requires/i.test(text)) {
      const tWorkforce = await getTranslations('workforce');
      return { error: tWorkforce('errors.timeEntryApprovedLocked') };
    }
    if (/duplicate key|unique constraint/i.test(text)) {
      const tWorkforce = await getTranslations('workforce');
      return { error: tWorkforce('errors.exactDuplicateTimeEntry') };
    }
    throw error;
  }

  const tErrors = await getTranslations('errors');
  const prefix = 'workforce.errors.';
  if (error.messageKey.startsWith(prefix)) {
    const shortKey = error.messageKey.slice(prefix.length);
    if (shortKey === 'dailyHoursExceeded' && error.details?.breakdown) {
      const breakdown = error.details.breakdown as {
        standardHoursPerDay: string;
        reportedSoFar: string;
        newHours: string;
        excessHours: string;
      };
      const tWorkforce = await getTranslations('workforce');
      return {
        error: tWorkforce('errors.dailyHoursExceeded'),
        dailyExcessWarning: breakdown,
      };
    }
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
      return { error: tMonthClose('errors.useCorrectionNotRewrite') };
    }
  }

  if (error.messageKey.startsWith('approvals.errors.')) {
    const tApprovals = await getTranslations('approvals');
    const shortKey = error.messageKey.slice('approvals.errors.'.length);
    return { error: tApprovals(`errors.${shortKey}` as 'errors.pending') };
  }

  if (error instanceof ValidationError) {
    const first = error.issues[0];
    if (first?.messageKey) {
      // Prefer i18n key when present
      try {
        if (first.messageKey.startsWith('workforce.')) {
          const tWorkforce = await getTranslations('workforce');
          return { error: tWorkforce(first.messageKey.slice('workforce.'.length) as 'errors.invalidBulkRange') };
        }
      } catch {
        /* fall through */
      }
    }
    return { error: tErrors('validationFailed') };
  }

  // Top-level errors.* keys (authz, not found, conflict, …)
  if (error.messageKey.startsWith('errors.')) {
    const short = error.messageKey.slice('errors.'.length);
    try {
      return { error: tErrors(short as 'notAllowed') };
    } catch {
      return { error: tErrors('unexpected') };
    }
  }

  // Last resort: still prefer a known AppError message over swallowing as unexpected
  // only when no messageKey could be resolved.
  return { error: fallback };
}

export function isRedirectError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'digest' in error &&
    typeof (error as { digest?: unknown }).digest === 'string' &&
    String((error as { digest: string }).digest).startsWith('NEXT_REDIRECT')
  );
}

export type { AppError };
