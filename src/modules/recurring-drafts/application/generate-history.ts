import type { OrgContext } from '@/shared/auth/context';
import { businessDate } from '@/shared/dates';
import { DomainRuleError, NotFoundError, ValidationError } from '@/shared/errors';
import { assertCanManageDraftKind } from '../domain/permissions';
import { assertDraftGeneratable } from '../domain/lifecycle';
import {
  firstBusinessDateOfYearMonth,
  listYearMonthsInclusive,
} from '../domain/amount-versions';
import { findRecurringDraftById } from '../data/recurring-drafts.repository';
import {
  generateRecurringDraftHistorySchema,
  type GenerateRecurringDraftHistoryInput,
} from '../validation/schemas';
import {
  generateRecurringDraftOccurrence,
  finalizeExistingRecurringMonthOccurrence,
  type GenerateRecurringDraftResult,
} from './generate';
import {
  summarizeOccurrenceOutcomes,
  type HistoryOutcomeSummary,
} from '../domain/occurrence-outcome';

export interface GenerateRecurringDraftHistoryResult {
  readonly draftId: string;
  readonly fromYearMonth: string;
  readonly toYearMonth: string;
  readonly generated: readonly GenerateRecurringDraftResult[];
  readonly finalizedExisting: readonly GenerateRecurringDraftResult[];
  readonly skippedExistingMonths: readonly string[];
  readonly summary: HistoryOutcomeSummary;
}

/**
 * Retro backfill: create one occurrence per missing YYYY-MM in range.
 * Each month keeps its own expenseDate (1st of month) — never dumps into current month.
 * Closed months: still insert draft when allowed; skip finalize (handled in generate).
 * Does not advance nextRunDate (history only).
 */
export async function generateRecurringDraftHistory(
  context: OrgContext,
  draftId: string,
  range: { readonly fromYearMonth: string; readonly toYearMonth: string },
): Promise<GenerateRecurringDraftHistoryResult> {
  const parsed = generateRecurringDraftHistorySchema.safeParse({
    draftId,
    fromYearMonth: range.fromYearMonth,
    toYearMonth: range.toYearMonth,
  } satisfies GenerateRecurringDraftHistoryInput);
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((issue) => ({ path: issue.path.join('.'), message: issue.message })),
    );
  }

  const draft = await findRecurringDraftById(
    context.db,
    context.organizationId,
    parsed.data.draftId,
  );
  if (!draft) throw new NotFoundError('Recurring draft');

  assertCanManageDraftKind(context, draft.draftKind);
  assertDraftGeneratable(draft.status);

  if (draft.frequency !== 'monthly') {
    throw new DomainRuleError(
      'History backfill is only supported for monthly templates',
      'recurringDrafts.errors.historyMonthlyOnly',
    );
  }

  const months = listYearMonthsInclusive(parsed.data.fromYearMonth, parsed.data.toYearMonth);
  const generated: GenerateRecurringDraftResult[] = [];
  const finalizedExisting: GenerateRecurringDraftResult[] = [];
  const skippedExistingMonths: string[] = [];

  // Reload draft each iteration so status/end stays accurate; schedule is not bumped.
  let current = draft;
  for (const yearMonth of months) {
    const freshest = await findRecurringDraftById(
      context.db,
      context.organizationId,
      current.id,
    );
    if (!freshest) throw new NotFoundError('Recurring draft');
    current = freshest;

    const runDate = businessDate(firstBusinessDateOfYearMonth(yearMonth));
    const result = await generateRecurringDraftOccurrence(context, current, {
      runDate,
      bumpSchedule: false,
      skipIfMonthExists: true,
      notes: `Retro history generate for ${yearMonth} — month-keyed occurrence.`,
    });

    if (!result) {
      const recovered = await finalizeExistingRecurringMonthOccurrence(context, current, yearMonth);
      if (recovered) {
        finalizedExisting.push(recovered);
        continue;
      }
      skippedExistingMonths.push(yearMonth);
      continue;
    }
    generated.push(result);
  }

  const baseSummary = summarizeOccurrenceOutcomes(
    [...generated, ...finalizedExisting].map((item) => item.outcome),
  );
  const summary: HistoryOutcomeSummary = {
    ...baseSummary,
    skippedExisting: baseSummary.skippedExisting + skippedExistingMonths.length,
  };

  return {
    draftId: draft.id,
    fromYearMonth: parsed.data.fromYearMonth,
    toYearMonth: parsed.data.toYearMonth,
    generated,
    finalizedExisting,
    skippedExistingMonths,
    summary,
  };
}
