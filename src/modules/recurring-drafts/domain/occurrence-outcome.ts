export type RecurringOccurrenceOutcome =
  | 'finalized'
  | 'draft'
  | 'blocked_closed'
  | 'blocked_missing_category'
  | 'skipped_existing';

export interface HistoryOutcomeSummary {
  readonly finalized: number;
  readonly draft: number;
  readonly blockedClosed: number;
  readonly blockedMissingCategory: number;
  readonly skippedExisting: number;
}

export function emptyHistoryOutcomeSummary(): HistoryOutcomeSummary {
  return {
    finalized: 0,
    draft: 0,
    blockedClosed: 0,
    blockedMissingCategory: 0,
    skippedExisting: 0,
  };
}

export function summarizeOccurrenceOutcomes(
  outcomes: readonly RecurringOccurrenceOutcome[],
): HistoryOutcomeSummary {
  let finalized = 0;
  let draft = 0;
  let blockedClosed = 0;
  let blockedMissingCategory = 0;
  let skippedExisting = 0;
  for (const outcome of outcomes) {
    switch (outcome) {
      case 'finalized':
        finalized += 1;
        break;
      case 'draft':
        draft += 1;
        break;
      case 'blocked_closed':
        blockedClosed += 1;
        break;
      case 'blocked_missing_category':
        blockedMissingCategory += 1;
        break;
      case 'skipped_existing':
        skippedExisting += 1;
        break;
    }
  }
  return {
    finalized,
    draft,
    blockedClosed,
    blockedMissingCategory,
    skippedExisting,
  };
}

export function mergeHistoryOutcomeSummaries(
  left: HistoryOutcomeSummary,
  right: HistoryOutcomeSummary,
): HistoryOutcomeSummary {
  return {
    finalized: left.finalized + right.finalized,
    draft: left.draft + right.draft,
    blockedClosed: left.blockedClosed + right.blockedClosed,
    blockedMissingCategory: left.blockedMissingCategory + right.blockedMissingCategory,
    skippedExisting: left.skippedExisting + right.skippedExisting,
  };
}
