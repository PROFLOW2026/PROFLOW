import type { OrgContext } from '@/shared/auth/context';
import { todayInTimeZone } from '@/shared/dates';
import { syncAutomaticExpensePayments } from '@/modules/expenses/application/expense-payments';
import { generateRecurringDraftHistory } from './generate-history';
import { generateRecurringDraftOccurrence } from './generate';
import {
  missingMonthRange,
  nextRunDateAfterRetro,
  retroMonthRangeFromStart,
} from '../domain/missing-months';
import { bumpScheduleAfterGenerate } from '../domain/schedule';
import type { RecurringFinancialDraftRecord } from '../domain/types';
import {
  findRecurringDraftById,
  listRecurringDrafts,
  listRunsForDraft,
  updateRecurringDraftById,
} from '../data/recurring-drafts.repository';
import { assertCanManageDraftKind } from '../domain/permissions';
import { assertDraftGeneratable } from '../domain/lifecycle';
import { businessDate, compareBusinessDates } from '@/shared/dates';
import { firstBusinessDateOfYearMonth } from '../domain/amount-versions';

export interface EnsureRecurringOccurrencesResult {
  readonly templatesScanned: number;
  readonly monthsGenerated: number;
  readonly schedulesAdvanced: number;
  readonly skippedExisting: number;
}

async function ensureMonthlyDraft(
  context: OrgContext,
  draft: RecurringFinancialDraftRecord,
  today: string,
): Promise<{ generated: number; skipped: number; advanced: boolean }> {
  assertCanManageDraftKind(context, draft.draftKind);
  assertDraftGeneratable(draft.status);

  const runs = await listRunsForDraft(context.db, context.organizationId, draft.id);
  const displayStartDate =
    runs.length > 0
      ? runs.reduce(
          (earliest, run) => (run.runDate < earliest ? run.runDate : earliest),
          runs[0]!.runDate,
        )
      : draft.nextRunDate;

  const expectedRange = retroMonthRangeFromStart(displayStartDate, today, draft.endDate);
  if (!expectedRange) return { generated: 0, skipped: 0, advanced: false };

  const missing = missingMonthRange(
    expectedRange.months,
    runs.map((run) => run.occurrenceYearMonth),
  );

  let generated = 0;
  let skipped = 0;

  if (missing) {
    const history = await generateRecurringDraftHistory(context, draft.id, {
      fromYearMonth: missing.fromYearMonth,
      toYearMonth: missing.toYearMonth,
    });
    generated += history.generated.length;
    skipped += history.skippedExistingMonths.length;
  }

  const refreshed = await findRecurringDraftById(context.db, context.organizationId, draft.id);
  if (!refreshed) return { generated, skipped, advanced: false };

  const nextRun = nextRunDateAfterRetro(
    expectedRange.toYearMonth,
    refreshed.nextRunDate,
    refreshed.frequency,
    refreshed.intervalCount,
  );

  // Only bump when the scheduled next date is not still in the future — advancing from a
  // future next_run_date with `today` as runDate incorrectly ends templates before end_date.
  const lastRunDate = businessDate(firstBusinessDateOfYearMonth(expectedRange.toYearMonth));
  const todayDate = businessDate(today);
  const scheduleRunDate =
    compareBusinessDates(refreshed.nextRunDate, todayDate) <= 0
      ? compareBusinessDates(refreshed.nextRunDate, lastRunDate) <= 0
        ? lastRunDate
        : todayDate
      : null;

  let advanced = false;
  if (scheduleRunDate) {
    const bumped = bumpScheduleAfterGenerate({
      currentNextRunDate: refreshed.nextRunDate,
      runDate: scheduleRunDate,
      frequency: refreshed.frequency,
      intervalCount: refreshed.intervalCount,
      endDate: refreshed.endDate,
    });
    const targetNext = bumped.nextRunDate >= nextRun ? bumped.nextRunDate : nextRun;

    if (targetNext !== refreshed.nextRunDate || bumped.status !== refreshed.status) {
      await updateRecurringDraftById(context.db, context.organizationId, draft.id, {
        nextRunDate: targetNext,
        status: bumped.status,
      });
      advanced = true;
    }
  }

  return { generated, skipped, advanced };
}

async function ensureNonMonthlyDueDraft(
  context: OrgContext,
  draft: RecurringFinancialDraftRecord,
  today: string,
): Promise<{ generated: number; skipped: number; advanced: boolean }> {
  let current = draft;
  let generated = 0;
  let skipped = 0;
  let advanced = false;

  while (current.status === 'active' && current.nextRunDate <= today) {
    assertCanManageDraftKind(context, current.draftKind);
    assertDraftGeneratable(current.status);

    const result = await generateRecurringDraftOccurrence(context, current, {
      runDate: current.nextRunDate,
      bumpSchedule: true,
      skipIfMonthExists: true,
      notes: 'Automatic ensure — due non-monthly occurrence.',
    });

    if (!result) {
      skipped += 1;
      break;
    }
    generated += 1;
    advanced = true;

    const refreshed = await findRecurringDraftById(context.db, context.organizationId, current.id);
    if (!refreshed || refreshed.status !== 'active') break;
    current = refreshed;
  }

  return { generated, skipped, advanced };
}

/**
 * Idempotent runtime sync: backfill missing monthly occurrences through today,
 * advance schedules, then apply automatic payment policies.
 */
export async function ensureRecurringDraftOccurrencesForOrg(
  context: OrgContext,
): Promise<EnsureRecurringOccurrencesResult> {
  const today = todayInTimeZone(context.organization.timezone);
  const drafts = await listRecurringDrafts(context.db, context.organizationId, {
    kind: 'expense',
    status: 'active',
  });

  let monthsGenerated = 0;
  let skippedExisting = 0;
  let schedulesAdvanced = 0;

  for (const draft of drafts) {
    if (draft.draftKind !== 'expense') continue;
    const outcome =
      draft.frequency === 'monthly'
        ? await ensureMonthlyDraft(context, draft, today)
        : await ensureNonMonthlyDueDraft(context, draft, today);
    monthsGenerated += outcome.generated;
    skippedExisting += outcome.skipped;
    if (outcome.advanced) schedulesAdvanced += 1;
  }

  await syncAutomaticExpensePayments(context, today);

  return {
    templatesScanned: drafts.length,
    monthsGenerated,
    schedulesAdvanced,
    skippedExisting,
  };
}
